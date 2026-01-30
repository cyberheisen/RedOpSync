import os
import time
import requests

API_BASE = os.getenv("API_BASE_URL", "http://api:8000")
AGENT_TOKEN = os.getenv("AGENT_TOKEN", "dev-agent-token")

def main():
    print("[redopsync-agent] starting (placeholder).")
    while True:
        try:
            r = requests.get(f"{API_BASE}/health", timeout=5)
            print(f"[redopsync-agent] api health: {r.status_code}")
        except Exception as e:
            print(f"[redopsync-agent] api not reachable: {e}")
        time.sleep(10)

if __name__ == "__main__":
    main()
