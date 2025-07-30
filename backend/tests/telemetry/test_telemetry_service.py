from app.telemetry.service import _compute_local_window

def test_compute_local_window_day():
    result = _compute_local_window("day", "Asia/Singapore")
    assert result["granularity"] == "hour"
    assert result["bucket"] == "1 hour"
    assert result["start_utc"] < result["end_utc"]

def test_compute_local_window_3days():
    result = _compute_local_window("3days", "Asia/Singapore")
    assert result["granularity"] == "day"
    assert result["bucket"] == "1 day"
    assert result["start_utc"] < result["end_utc"]

def test_compute_local_window_week():
    result = _compute_local_window("week", "Asia/Singapore")
    assert result["granularity"] == "day"
    assert result["bucket"] == "1 day"
    assert result["start_utc"] < result["end_utc"]