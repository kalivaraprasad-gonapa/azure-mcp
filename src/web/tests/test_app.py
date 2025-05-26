import pytest
from unittest.mock import patch, MagicMock
from sqlalchemy.exc import OperationalError

# Assuming your Flask app instance is created in src.web.app
# Adjust the import if your app instance is named differently or located elsewhere
from src.web.app import app as flask_app

@pytest.fixture
def app():
    yield flask_app

@pytest.fixture
def client(app):
    return app.test_client()

def test_index_route(client):
    """Test the index route."/"""
    response = client.get('/')
    assert response.status_code == 200
    # Add a check for some content if desired, e.g.,
    # assert b"Welcome" in response.data # Assuming "Welcome" is in your index.html

def test_health_route_db_ok(client):
    """Test the /health route when the database is responsive."""
    with patch('src.web.app.get_db') as mock_get_db:
        mock_db_connection = MagicMock()
        mock_db_result = MagicMock()
        mock_db_result.one.return_value = ("mocked_db_time",) # Simulate successful query
        mock_db_connection.execute.return_value = mock_db_result
        mock_get_db.return_value = mock_db_connection

        response = client.get('/health')
        assert response.status_code == 200
        assert response.data.decode() == "OK"
        mock_db_connection.execute.assert_called_once()

def test_health_route_db_error(client):
    """Test the /health route when the database throws an OperationalError."""
    with patch('src.web.app.get_db') as mock_get_db:
        mock_db_connection = MagicMock()
        mock_db_connection.execute.side_effect = OperationalError("mocked error", {}, None)
        mock_get_db.return_value = mock_db_connection

        response = client.get('/health')
        assert response.status_code == 200 # Route itself doesn't fail
        assert response.data.decode() == "BAD"
        mock_db_connection.execute.assert_called_once()

def test_health_route_generic_db_error(client):
    """Test the /health route when the database throws a generic Exception."""
    with patch('src.web.app.get_db') as mock_get_db:
        mock_db_connection = MagicMock()
        mock_db_connection.execute.side_effect = Exception("mocked generic error")
        mock_get_db.return_value = mock_db_connection

        response = client.get('/health')
        assert response.status_code == 200
        assert response.data.decode() == "BAD"
        mock_db_connection.execute.assert_called_once()
