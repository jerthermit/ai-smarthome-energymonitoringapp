import pytest
from app.ai.energy_service import EnergyQueryProcessor
from app.ai.chat_schemas import EnergyQueryResponse
from types import SimpleNamespace

class DummyDB:
    pass  # placeholder DB, no actual connection needed

@pytest.mark.asyncio
async def test_handle_rank_query_highest(mocker):
    """
    Unit test for EnergyQueryProcessor._handle_rank_query()

    What this test covers:
    - Simulates 3 devices with known energy_kwh values
    - Mocks telemetry service to return those devices
    - Checks that the device with highest kWh is correctly selected
    - Confirms summary string is formatted properly
    - Verifies data structure matches expected response shape
    """

    # Simulated telemetry data (mocked from DB)
    mock_data = [
        SimpleNamespace(device_id="dev1", energy_kwh=3.5),
        SimpleNamespace(device_id="dev2", energy_kwh=5.0),  # <-- should be ranked highest
        SimpleNamespace(device_id="dev3", energy_kwh=1.2),
    ]

    # Mock the telemetry service to return this known dataset
    mocker.patch(
        "app.telemetry.service.get_device_energy_summary_windowed",
        return_value=mock_data
    )

    processor = EnergyQueryProcessor(db=DummyDB())

    # Device ID -> Friendly Name
    device_names = {
        "dev1": "Heater",
        "dev2": "Aircon",
        "dev3": "Fridge"
    }

    parsed = {"rank": "highest"}
    response: EnergyQueryResponse = await processor._handle_rank_query(
        user_id=1,
        rank="highest",
        rank_num=None,
        range_key="day",
        tz="Asia/Manila",
        device_ids=None,
        device_names_map=device_names,
        parsed_meta=parsed
    )

    # Assert summary and top device match expected values
    assert isinstance(response, EnergyQueryResponse)
    assert "**Aircon**" in response.summary
    assert response.data["top_device"]["kwh"] == 5.0
    assert response.data["top_device"]["name"] == "Aircon"