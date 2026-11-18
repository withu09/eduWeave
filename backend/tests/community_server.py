"""Local browser-test server with a disposable database and no model requests."""
import argparse
import os
import sys
import tempfile
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8766)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    sys.path.insert(0, str(root / "backend"))
    with tempfile.TemporaryDirectory(prefix="eduweave-community-") as directory:
        os.environ["DATABASE_URL"] = "sqlite:///" + (Path(directory) / "community.db").as_posix()
        from fastapi import FastAPI
        from fastapi.staticfiles import StaticFiles
        from app.db.database import engine, init_db
        from app.routers.community import router
        import uvicorn

        init_db()
        app = FastAPI()
        app.include_router(router)

        @app.get("/api/health")
        def health():
            return {"status": "ok", "isolated_community_test": True}

        @app.get("/api/kb/tree")
        @app.post("/api/kb/sync")
        def empty_knowledge_base():
            return {"tree": []}

        app.mount("/", StaticFiles(directory=os.environ.get("EDUWEAVE_TEST_DIST_DIR", root / "frontend/dist"), html=True))
        try:
            uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="warning")
        finally:
            engine.dispose()


if __name__ == "__main__":
    main()
