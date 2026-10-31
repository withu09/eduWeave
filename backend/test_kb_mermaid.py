import pytest
from fastapi.testclient import TestClient
from main import app
import os
import json

client = TestClient(app)

def test_get_kb_mermaid():
    # Test the default mock case
    response = client.get("/api/kb/mermaid/test_node_123")
    assert response.status_code == 200
    data = response.json()
    assert "mermaid_schema" in data
    assert "test_node_123" in data["mermaid_schema"]
    assert "graph TD" in data["mermaid_schema"]
    
    print("Test passed successfully!")

if __name__ == "__main__":
    test_get_kb_mermaid()
