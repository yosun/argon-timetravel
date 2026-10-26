"""Mocked AI3D transport contracts and synthetic EXR parsing; no live inference."""
import base64
import importlib.util
import http.client
import io
import json
import math
from pathlib import Path
import tempfile
import threading
from concurrent.futures import Future, ThreadPoolExecutor
import unittest
from unittest import mock

SPEC = importlib.util.spec_from_file_location('depth_service_under_test', Path(__file__).resolve().parents[1] / 'depth_service.py')
depth = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(depth)


class ArtifactSecurityTests(unittest.TestCase):
    def test_api_bearer_is_scoped_to_exact_https_api_host(self):
        with mock.patch.object(depth, 'AI3D_API_KEY', 'dummy-test-key'):
            request = depth.artifact_request('https://api.ai3d.dev:443/v2/artifacts/a')
            self.assertEqual(request.get_header('Authorization'), 'Bearer dummy-test-key')
            for url in ('https://files.example.org/result.exr?signature=public-test',
                        'https://api.ai3d.dev.example.org/result.exr'):
                self.assertIsNone(depth.artifact_request(url).get_header('Authorization'))

    def test_unsafe_urls_are_rejected_before_download(self):
        urls = ['http://files.example.org/a', 'file:///etc/passwd',
                'https://user:pass@api.ai3d.dev/a', 'https://api.ai3d.dev:8443/a',
                'https://127.0.0.1/a', 'https://127.1/a', 'https://0x7f.0.0.1/a',
                'https://[::1]/a', 'https://localhost/a',
                'https://service.internal/a', 'https://api.ai3d.dev/a#fragment',
                'https://api.ai3d.dev\\@files.example.org/a',
                'https://api.ai3d.dev/a\nX-Test: injected']
        for url in urls:
            with self.subTest(url=url), self.assertRaises(ValueError):
                depth.artifact_request(url)

    def test_redirects_drop_bearer_and_preserve_https_policy(self):
        handler = depth.ArtifactRedirectHandler()
        with mock.patch.object(depth, 'AI3D_API_KEY', 'dummy-test-key'):
            original = depth.artifact_request('https://api.ai3d.dev/v2/artifacts/a')
            redirected = handler.redirect_request(original, None, 302, 'Found', {}, 'https://files.example.org/a?signed=test')
            self.assertIsNone(redirected.get_header('Authorization'))
            same_host = handler.redirect_request(original, None, 302, 'Found', {}, 'https://api.ai3d.dev/v2/artifacts/b')
            self.assertEqual(same_host.get_header('Authorization'), 'Bearer dummy-test-key')
            with self.assertRaises(ValueError):
                handler.redirect_request(original, None, 302, 'Found', {}, 'http://files.example.org/a')


class MockedAI3DContractTests(unittest.TestCase):
    def test_upload_job_poll_and_signed_artifact_download_contract(self):
        """Canned responses verify request format, not AI3D availability or model quality."""
        api_requests, artifact_requests = [], []
        artifact_specs = [
            ('points.exr', 'https://files.example.org/points.exr?signature=test'),
            ('depth.exr', 'https://files.example.org/depth.exr?signature=test'),
            ('image.png', 'https://api.ai3d.dev/v2/artifacts/image.png'),
            ('mesh.glb', 'https://files.example.org/mesh.glb?signature=test'),
        ]
        def fake_api(request, timeout):
            api_requests.append(request)
            if request.full_url.endswith('/uploads'):
                data = {'image_url': 'https://files.example.org/uploaded-photo.jpg'}
            elif request.full_url.endswith('/jobs'):
                data = {'id': 'test-job', 'status': 'queued'}
            else:
                self.assertTrue(request.full_url.endswith('/jobs/test-job'))
                data = {'id': 'test-job', 'status': 'succeeded', 'artifacts': [
                    {'name': name, 'download_url': url} for name, url in artifact_specs
                ]}
            return io.BytesIO(json.dumps(data).encode())
        def fake_artifact(request, timeout):
            artifact_requests.append(request)
            return io.BytesIO(b'synthetic-artifact-bytes-not-a-model-result')
        with tempfile.TemporaryDirectory() as temporary, \
             mock.patch.object(depth, 'CACHE_DIR', Path(temporary)), \
             mock.patch.object(depth, 'AI3D_API_KEY', 'dummy-test-key'), \
             mock.patch.object(depth.urllib.request, 'urlopen', side_effect=fake_api), \
             mock.patch.object(depth._ARTIFACT_OPENER, 'open', side_effect=fake_artifact), \
             mock.patch.object(depth.time, 'sleep'):
            result = depth.run_moge2_remote_job(b'photo-fixture', 'test-photo-sha')
            self.assertTrue((result / 'job_meta.json').is_file())
            self.assertEqual(len(api_requests), 3)
            self.assertEqual(api_requests[0].get_method(), 'POST')
            self.assertIn(b'name="image"; filename="photo.jpg"', api_requests[0].data)
            self.assertIn(b'photo-fixture', api_requests[0].data)
            job_body = json.loads(api_requests[1].data)
            self.assertEqual(job_body['model'], 'moge2')
            self.assertEqual(job_body['input']['max_size'], 800)
            self.assertEqual(job_body['image_url'], 'https://files.example.org/uploaded-photo.jpg')
            for request in api_requests:
                self.assertEqual(request.get_header('Authorization'), 'Bearer dummy-test-key')
            self.assertEqual(len(artifact_requests), len(artifact_specs))
            for request in artifact_requests:
                expected = 'Bearer dummy-test-key' if request.host == 'api.ai3d.dev' else None
                self.assertEqual(request.get_header('Authorization'), expected)
            # Complete artifacts can be reused without sending another request.
            depth.run_moge2_remote_job(b'photo-fixture', 'test-photo-sha')
            self.assertEqual(len(api_requests), 3)

    def test_missing_artifacts_are_not_reported_as_success(self):
        def response(request, timeout):
            payload = {'image_url': 'https://files.example.org/a'} if request.full_url.endswith('/uploads') else {'id': 'empty-job', 'status': 'succeeded', 'artifacts': []}
            return io.BytesIO(json.dumps(payload).encode())
        with tempfile.TemporaryDirectory() as temporary, \
             mock.patch.object(depth, 'CACHE_DIR', Path(temporary)), \
             mock.patch.object(depth, 'AI3D_API_KEY', 'dummy-test-key'), \
             mock.patch.object(depth.urllib.request, 'urlopen', side_effect=response):
            with self.assertRaisesRegex(RuntimeError, 'missing required geometry artifacts'):
                depth.run_moge2_remote_job(b'fixture', 'missing')


class UploadImageTypeTests(unittest.TestCase):
    def image_data_url(self, image_format, mime_type):
        stream = io.BytesIO()
        depth.Image.new("RGB", (4, 3), (70, 90, 110)).save(stream, format=image_format)
        image_bytes = stream.getvalue()
        return f"data:{mime_type};base64,{base64.b64encode(image_bytes).decode()}", image_bytes

    def test_png_and_webp_keep_their_multipart_type_and_extension(self):
        """Real image containers, mocked AI3D transport: no remote inference runs."""
        for image_format, mime_type, extension in (("PNG", "image/png", "png"), ("WEBP", "image/webp", "webp")):
            with self.subTest(mime_type=mime_type), tempfile.TemporaryDirectory() as temporary:
                data_url, original_bytes = self.image_data_url(image_format, mime_type)
                image_bytes, decoded_mime = depth.decode_image_input(data_url)
                self.assertEqual(image_bytes, original_bytes)
                self.assertEqual(decoded_mime, mime_type)
                requests = []
                def fake_api(request, timeout):
                    requests.append(request)
                    if request.full_url.endswith('/uploads'):
                        payload = {'image_url': 'https://files.example.org/photo.' + extension}
                    else:
                        payload = {'id': 'image-type-job', 'status': 'succeeded', 'artifacts': [
                            {'name': name, 'download_url': 'https://files.example.org/' + name}
                            for name in ('points.exr', 'depth.exr', 'image.png')
                        ]}
                    return io.BytesIO(json.dumps(payload).encode())
                with mock.patch.object(depth, 'CACHE_DIR', Path(temporary)), \
                     mock.patch.object(depth, 'AI3D_API_KEY', 'dummy-test-key'), \
                     mock.patch.object(depth.urllib.request, 'urlopen', side_effect=fake_api), \
                     mock.patch.object(depth._ARTIFACT_OPENER, 'open', side_effect=lambda request, timeout: io.BytesIO(b'fixture')):
                    depth.run_moge2_remote_job(image_bytes, 'image-type-' + extension, mime_type=decoded_mime)
                upload_body = requests[0].data
                self.assertIn(f'filename="photo.{extension}"'.encode(), upload_body)
                self.assertIn(f'Content-Type: {mime_type}\r\n\r\n'.encode(), upload_body)
                self.assertIn(original_bytes, upload_body)
                self.assertNotIn(b'Content-Type: image/jpeg', upload_body)

    def test_http_handler_passes_the_data_url_mime_to_remote_job(self):
        for image_format, mime_type in (("PNG", "image/png"), ("WEBP", "image/webp")):
            with self.subTest(mime_type=mime_type), tempfile.TemporaryDirectory() as temporary:
                data_url, image_bytes = self.image_data_url(image_format, mime_type)
                encoded_body = json.dumps({'imageBase64': data_url}).encode()
                handler = object.__new__(depth.MoGe2GeometryHandler)
                handler.path = '/estimate-depth'
                handler.headers = {'Content-Length': str(len(encoded_body))}
                handler.rfile = io.BytesIO(encoded_body)
                handler._send_json = mock.Mock()
                with mock.patch.object(depth, 'CACHE_DIR', Path(temporary)), \
                     mock.patch.object(depth, 'run_moge2_remote_job', return_value=Path(temporary)) as run_job, \
                     mock.patch.object(depth, 'parse_moge2_artifacts', return_value={'pointsGrid': []}):
                    handler.do_POST()
                run_job.assert_called_once_with(image_bytes, depth.hashlib.sha256(image_bytes).hexdigest(), mime_type=mime_type)
                self.assertEqual(handler._send_json.call_args.args[0], 200)

    def test_legacy_raw_base64_defaults_to_jpeg(self):
        image_bytes = b'legacy-jpeg-fixture'
        self.assertEqual(depth.decode_image_input(base64.b64encode(image_bytes).decode()), (image_bytes, 'image/jpeg'))

    def test_unsupported_types_and_invalid_base64_fail_before_remote_request(self):
        with mock.patch.object(depth.urllib.request, 'urlopen') as transport:
            for data_url in ('data:image/svg+xml;base64,PHN2Zy8+',
                             'data:image/gif;base64,R0lGODlh',
                             'data:image/png,not-base64', 'data:image/png;base64,!!',
                             'data:image/png;base64,'):
                with self.subTest(data_url=data_url), self.assertRaises(ValueError):
                    depth.decode_image_input(data_url)
            with self.assertRaisesRegex(ValueError, 'Supported upload types'):
                depth.run_moge2_remote_job(b'fixture', 'unsupported', mime_type='image/gif')
            transport.assert_not_called()


class ConcurrentDepthRequestTests(unittest.TestCase):
    def test_health_remains_responsive_and_same_image_uses_one_remote_job(self):
        """Real local HTTP, mocked slow AI3D inference, actual synthetic EXR parsing."""
        upload_started = threading.Event()
        release_upload = threading.Event()
        duplicate_waiting = threading.Event()
        api_requests = []
        request_lock = threading.Lock()
        class TrackingFuture(Future):
            def result(self, timeout=None):
                duplicate_waiting.set()
                return super().result(timeout=timeout)
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            fixture_dir = folder / 'fixtures'
            fixture_dir.mkdir()
            np, cv2 = depth.np, depth.cv2
            height, width = 16, 12
            rows, columns = np.indices((height, width), dtype=np.float32)
            z = np.full((height, width), 4.0, dtype=np.float32)
            focal_y = height / (2 * math.tan(math.radians(60) / 2))
            x = (columns + 0.5 - width / 2) * z / focal_y
            y = (rows + 0.5 - height / 2) * z / focal_y
            cv2.imwrite(str(fixture_dir / 'points.exr'), np.stack([z, y, x], axis=-1))
            cv2.imwrite(str(fixture_dir / 'depth.exr'), z)
            cv2.imwrite(str(fixture_dir / 'image.png'), np.zeros((height, width, 3), dtype=np.uint8))
            artifacts = {name: (fixture_dir / name).read_bytes() for name in ('points.exr', 'depth.exr', 'image.png')}
            image_base64 = base64.b64encode(b'same-image-fixture').decode()
            payload = json.dumps({'imageBase64': image_base64, 'gridWidth': 6, 'gridHeight': 8}).encode()
            def fake_api(request, timeout):
                with request_lock:
                    api_requests.append(request)
                if request.full_url.endswith('/uploads'):
                    upload_started.set()
                    if not release_upload.wait(timeout=10):
                        raise TimeoutError('Test did not release mocked AI3D upload')
                    result = {'image_url': 'https://files.example.org/photo.jpg'}
                else:
                    result = {'id': 'one-paid-job', 'status': 'succeeded', 'artifacts': [
                        {'name': name, 'download_url': 'https://files.example.org/' + name} for name in artifacts
                    ]}
                return io.BytesIO(json.dumps(result).encode())
            def fake_artifact(request, timeout):
                return io.BytesIO(artifacts[request.full_url.rsplit('/', 1)[-1]])
            with mock.patch.object(depth, 'CACHE_DIR', folder / 'cache'), \
                 mock.patch.object(depth, 'AI3D_API_KEY', 'dummy-test-key'), \
                 mock.patch.object(depth, 'Future', TrackingFuture), \
                 mock.patch.object(depth.urllib.request, 'urlopen', side_effect=fake_api), \
                 mock.patch.object(depth._ARTIFACT_OPENER, 'open', side_effect=fake_artifact):
                server = depth.ThreadingHTTPServer(('127.0.0.1', 0), depth.MoGe2GeometryHandler)
                server_thread = threading.Thread(target=server.serve_forever, daemon=True)
                server_thread.start()
                def request_local(method, path, body=None):
                    connection = http.client.HTTPConnection('127.0.0.1', server.server_port, timeout=5)
                    try:
                        connection.request(method, path, body=body, headers={'Content-Type': 'application/json'})
                        response = connection.getresponse()
                        return response.status, json.loads(response.read())
                    finally:
                        connection.close()
                try:
                    with ThreadPoolExecutor(max_workers=2) as executor:
                        first = executor.submit(request_local, 'POST', '/estimate-depth', payload)
                        self.assertTrue(upload_started.wait(timeout=3), 'First inference did not start')
                        second = executor.submit(request_local, 'POST', '/estimate-depth', payload)
                        try:
                            self.assertTrue(duplicate_waiting.wait(timeout=3), 'Duplicate did not join pending inference')
                            # Both depth requests are still in flight while this separate HTTP request completes.
                            status, health = request_local('GET', '/health')
                            self.assertEqual(status, 200)
                            self.assertTrue(health['ok'])
                            self.assertTrue(health['apiKeyConfigured'])
                            self.assertFalse(first.done())
                            self.assertFalse(second.done())
                        finally:
                            release_upload.set()
                        first_status, first_result = first.result(timeout=5)
                        second_status, second_result = second.result(timeout=5)
                        self.assertEqual((first_status, second_status), (200, 200))
                        self.assertEqual(first_result['pointsGrid'], second_result['pointsGrid'])
                        self.assertEqual(first_result['sha256'], second_result['sha256'])
                        self.assertTrue(first_result['ok'])
                finally:
                    release_upload.set()
                    server.shutdown()
                    server.server_close()
                    server_thread.join(timeout=3)
                self.assertEqual(sum(request.full_url.endswith('/uploads') for request in api_requests), 1)
                self.assertEqual(sum(request.full_url.endswith('/jobs') for request in api_requests), 1)
                self.assertEqual(depth._IMAGE_JOBS, {})

    def test_waiting_duplicate_receives_failure_without_resubmitting(self):
        """Concurrent requests share a remote failure instead of creating duplicate paid jobs."""
        started, release, waiting = threading.Event(), threading.Event(), threading.Event()
        class TrackingFuture(Future):
            def result(self, timeout=None):
                waiting.set()
                return super().result(timeout=timeout)
        def fail_remote(*args):
            started.set()
            if not release.wait(timeout=5):
                raise TimeoutError('Test did not release mocked remote failure')
            raise RuntimeError('mocked remote inference failure')
        with mock.patch.object(depth, 'Future', TrackingFuture), \
             mock.patch.object(depth, '_run_moge2_remote_job', side_effect=fail_remote) as submit, \
             ThreadPoolExecutor(max_workers=2) as executor:
            first = executor.submit(depth.run_moge2_remote_job, b'fixture', 'shared-failure')
            self.assertTrue(started.wait(timeout=2))
            second = executor.submit(depth.run_moge2_remote_job, b'fixture', 'shared-failure')
            try:
                self.assertTrue(waiting.wait(timeout=2))
            finally:
                release.set()
            for result in (first, second):
                with self.assertRaisesRegex(RuntimeError, 'mocked remote inference failure'):
                    result.result(timeout=3)
            self.assertEqual(submit.call_count, 1)
            self.assertEqual(depth._IMAGE_JOBS, {})


class SyntheticEXRParserTests(unittest.TestCase):
    def test_finite_exr_geometry_is_converted_to_three_coordinate_grid(self):
        """Actual OpenCV EXR round-trip using analytic synthetic camera geometry."""
        np, cv2 = depth.np, depth.cv2
        height, width = 16, 12
        focal_y = height / (2 * math.tan(math.radians(60) / 2))
        rows, columns = np.indices((height, width), dtype=np.float32)
        z = np.full((height, width), 4.0, dtype=np.float32)
        x = (columns + 0.5 - width / 2) * z / focal_y
        y = (rows + 0.5 - height / 2) * z / focal_y
        points_bgr = np.stack([z, y, x], axis=-1)
        points_bgr[0, 0, 2] = np.nan  # Invalid X must not escape into JSON geometry.
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            self.assertTrue(cv2.imwrite(str(folder / 'points.exr'), points_bgr))
            self.assertTrue(cv2.imwrite(str(folder / 'depth.exr'), z))
            self.assertTrue(cv2.imwrite(str(folder / 'image.png'), np.zeros((height, width, 3), dtype=np.uint8)))
            result = depth.parse_moge2_artifacts(folder, grid_w=6, grid_h=8)
            self.assertEqual((result['gridWidth'], result['gridHeight']), (6, 8))
            grid = np.asarray(result['pointsGrid'])
            self.assertEqual(grid.shape, (8, 6, 3))
            self.assertTrue(np.isfinite(grid).all())
            self.assertTrue((grid[..., 2] == -4).all())
            self.assertGreater(grid[0, -1, 1], 0)  # OpenCV Y-down becomes Three Y-up.
            self.assertLess(grid[-1, -1, 1], 0)
            self.assertAlmostEqual(result['cameraIntrinsics']['fovYDeg'], 60, places=2)
            self.assertEqual(result['depthMinMeters'], 4)
            self.assertEqual(result['depthMaxMeters'], 4)
            # Reject NaN/Infinity serialization across the entire API payload.
            json.dumps(result, allow_nan=False)
            self.assertGreater(len(base64.b64decode(result['depthColorMapBase64'].split(',')[1])), 0)

    def test_absent_point_map_has_clear_failure(self):
        with tempfile.TemporaryDirectory() as temporary:
            with self.assertRaisesRegex(RuntimeError, 'three-channel point map'):
                depth.parse_moge2_artifacts(Path(temporary), grid_w=6, grid_h=8)


if __name__ == '__main__':
    unittest.main()
