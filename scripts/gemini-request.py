"""Private Gemini HTTPS bridge: key from environment, JSON stdin/stdout, no argv secrets."""
import json
import os
import re
import socket
import sys
import urllib.error
import urllib.parse
import urllib.request

API_ORIGIN = "https://generativelanguage.googleapis.com"
MAX_RESPONSE_BYTES = 32 * 1024 * 1024


def redact(value, key):
    text = str(value or "")
    if key:
        text = text.replace(key, "[REDACTED]")
    text = re.sub(r"AIza[A-Za-z0-9_-]{20,}", "[REDACTED]", text)
    text = re.sub(r"([?&]key=)[^&\s\"']+", r"\1[REDACTED]", text, flags=re.I)
    return text


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, newurl):
        # The endpoint is fixed; never forward a credential to a redirect destination.
        return None


def perform(request, key):
    if not key:
        return {"status": 503, "body": {"error": {"message": "Configure GEMINI_API_KEY securely for the Gemini API."}}}
    model = str(request.get("model", ""))
    if request.get("operation") != "listModels" and not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", model):
        return {"status": 400, "body": {"error": {"message": "Invalid Gemini model ID."}}}
    operation = request.get("operation")
    if operation == "generateContent":
        url = API_ORIGIN + "/v1beta/models/" + model + ":generateContent"
        data = json.dumps(request.get("payload", {})).encode("utf-8")
        method = "POST"
    elif operation == "listModels":
        query = {"pageSize": "1000"}
        if request.get("pageToken"):
            query["pageToken"] = request["pageToken"]
        url = API_ORIGIN + "/v1beta/models?" + urllib.parse.urlencode(query)
        data = None
        method = "GET"
    else:
        return {"status": 400, "body": {"error": {"message": "Unsupported Gemini API operation."}}}
    timeout = max(1, min(240, float(request.get("timeoutMs", 120000)) / 1000))
    outbound = urllib.request.Request(url, data=data, method=method,
        headers={"x-goog-api-key": key, "Content-Type": "application/json", "Accept": "application/json"})
    # Standard proxy and TLS handlers are retained; custom redirects are refused.
    opener = urllib.request.build_opener(NoRedirect())
    try:
        with opener.open(outbound, timeout=timeout) as response:
            raw = response.read(MAX_RESPONSE_BYTES + 1)
            if len(raw) > MAX_RESPONSE_BYTES:
                raise ValueError("Gemini response exceeded the size limit.")
            return {"status": response.status, "body": json.loads(raw)}
    except urllib.error.HTTPError as error:
        # Do not forward arbitrary response bodies, headers, URLs, or diagnostics.
        message = "Gemini API returned HTTP " + str(error.code) + "."
        try:
            document = json.loads(error.read(1024 * 1024))
            message = document.get("error", {}).get("message") or message
        except (ValueError, TypeError, AttributeError):
            pass
        return {"status": error.code, "body": {"error": {"message": redact(message, key)}}}
    except (TimeoutError, socket.timeout):
        return {"status": 504, "body": {"error": {"message": "Gemini request timed out; no automatic retry was submitted."}}}
    except (urllib.error.URLError, OSError):
        return {"status": 502, "body": {"error": {"message": "Gemini HTTPS connection failed. Check cloud egress and TLS configuration."}}}
    except (ValueError, TypeError):
        return {"status": 502, "body": {"error": {"message": "Gemini API returned an invalid or oversized JSON response."}}}


def main():
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    try:
        request = json.load(sys.stdin)
        result = perform(request, key)
        # Redact again at the process boundary, including any successful unexpected echo.
        sys.stdout.write(redact(json.dumps(result), key))
    except Exception:
        sys.stdout.write(json.dumps({"status": 502, "body": {"error": {"message": "Gemini HTTPS transport could not complete the request."}}}))


if __name__ == "__main__":
    main()
