import subprocess
import os

if __name__ == "__main__":
    # Current directory: backend/tests/
    backend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    tests_path = os.path.abspath(os.path.dirname(__file__))

    # Set PYTHONPATH to backend/
    env = os.environ.copy()
    env["PYTHONPATH"] = backend_path

    # Run all tests inside backend/tests
    subprocess.run(
        ["pytest", tests_path],
        env=env,
        cwd=tests_path,
    )