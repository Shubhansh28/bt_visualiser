# Re-export the Flask app from server.py so `gunicorn app:app` works
from server import app  # noqa: F401
