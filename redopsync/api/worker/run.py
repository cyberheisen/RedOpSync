import os
from rq import Worker, Queue, Connection
import redis

def main():
    redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
    conn = redis.from_url(redis_url)
    with Connection(conn):
        worker = Worker([Queue("default")])
        worker.work(with_scheduler=True)

if __name__ == "__main__":
    main()
