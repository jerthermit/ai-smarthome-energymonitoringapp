"""
Energy Query Processing Service.
Handles parsing natural language energy queries and generating structured responses.
"""
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional

from .chat_schemas import EnergyQueryResponse, TimeRange, DeviceUsage, TimeSeriesPoint
from .providers.base import AIProvider
from .data.energy_repository import EnergyRepository, TimeRange

logger = logging.getLogger(__name__)

class EnergyQueryProcessor:
    """Processes natural language energy queries and generates structured responses."""
    
    def __init__(self, ai_provider: AIProvider, energy_repo: EnergyRepository):
        """Initialize with an AI provider and an energy data repository."""
        self.ai_provider = ai_provider
        self.energy_repo = energy_repo
        self.system_prompt = """
        You are an AI assistant for a smart home energy monitoring system. Your role is to help users understand their energy usage.
        
        When users ask about energy consumption:
        1. Identify the device(s) they're asking about
        2. Determine the time period they're interested in
        3. Understand what specific metric they want (usage, cost, comparison, etc.)
        4. Structure the response in the required JSON format
        
        Always respond with a valid JSON object containing these fields:
        - summary: A natural language summary of the energy usage
        - data: Structured information about the energy usage
        - time_series: Optional time-series data if relevant
        - metadata: Additional context about the query
        """
    
    async def process_query(self, user_id: int, user_query: str) -> EnergyQueryResponse:
        """
        Process a natural language energy query and return a structured response.
        
        Args:
            user_query: The user's natural language query about energy usage
            
        Returns:
            An EnergyQueryResponse object containing the structured response
        """
        try:
            # First, use AI to understand the query
            parsed_query = await self._parse_query(user_query)
            
            # Then generate a structured response using the user_id
            response = await self._generate_response(user_id, parsed_query)
            
            return response
            
        except Exception as e:
            logger.error(f"Error processing energy query: {str(e)}", exc_info=True)
            return self._create_error_response(str(e))
    
    async def _parse_query(self, query: str) -> Dict[str, Any]:
        """Use AI to parse the natural language query into structured data."""
        prompt = f"""
        Parse this energy query into a JSON object with these fields:
        - time_range_type: One of ["today", "yesterday", "this_week", "last_week", "this_month", "last_month", "custom"]
        - devices: List of device names or ["all"]
        - metric: The type of metric being queried (e.g., "consumption", "cost", "comparison")
        
        Query: {query}
        
        Respond with a JSON object only, no other text.
        """
        
        try:
            response_json = await self.ai_provider.get_structured_response(
                prompt=prompt,
                response_format={
                    "type": "json_object",
                    "schema": {
                        "type": "object",
                        "properties": {
                            "time_range_type": {"type": "string", "enum": ["today", "yesterday", "this_week", "last_week", "this_month", "last_month", "custom"]},
                            "devices": {"type": "array", "items": {"type": "string"}, "default": ["all"]},
                            "metric": {"type": "string", "default": "consumption"}
                        },
                        "required": ["time_range_type"]
                    }
                }
            )
            
            # Ensure we have a dictionary and not a list
            if isinstance(response_json, list) and len(response_json) > 0:
                response_json = response_json[0] if isinstance(response_json[0], dict) else {"time_range_type": "today", "devices": ["all"], "metric": "consumption"}
            elif not isinstance(response_json, dict):
                response_json = {"time_range_type": "today", "devices": ["all"], "metric": "consumption"}
                
            return response_json
            
        except Exception as e:
            logger.warning(f"Failed to parse query with AI, using default values. Error: {str(e)}")
            return {"time_range_type": "today", "devices": ["all"], "metric": "consumption"}
    
    async def _generate_response(self, user_id: int, parsed_query: Dict[str, Any]) -> EnergyQueryResponse:
        """Generate a structured response based on the parsed query."""
        time_range_type = parsed_query.get("time_range_type", "today")
        devices = parsed_query.get("devices", ["all"])
        
        # 1. Get the data from the repository
        time_range = TimeRange.from_string(time_range_type)
        device_name_filter = devices[0] if devices[0] != 'all' else None

        # Fetch aggregated data and time-series data
        usage_data = await self.energy_repo.get_energy_usage(
            user_id=user_id,
            device_name=device_name_filter,
            start_time=time_range.start,
            end_time=time_range.end,
            time_group='day' # Example granularity
        )

        # For the final response, we can re-format this into our Pydantic models
        # This part requires translating the generic repository response to the specific chat schema
        # For now, we will create a summary and pass some data through.
        time_series_points = [
            TimeSeriesPoint(
                timestamp=point['time_period'],
                value=point['total_energy_wh'],
                unit='Wh'
            ) for point in usage_data.get('data', [])
        ]

        # 2. Generate a dynamic summary with the AI
        messages = [
            {"role": "system", "content": "You are a helpful assistant that summarizes energy usage data in a clear and concise way."},
            {"role": "user", "content": f"""
            Please summarize this energy usage data in 1-2 friendly sentences:
            {usage_data.get('summary')}
            """}
        ]
        
        response = await self.ai_provider.chat_completion(
            messages=messages,
            max_tokens=100,
            temperature=0.3  # Keep it factual
        )
        summary = response.get('choices', [{}])[0].get('message', {}).get('content', 'Energy data is currently unavailable.')

        # 3. Format the response
        return EnergyQueryResponse(
            summary=summary,
            data=usage_data.get('summary', {}),
            time_series=time_series_points,
            metadata={
                "query_processed": parsed_query,
                "generated_at": datetime.utcnow().isoformat(),
                "raw_repo_response": usage_data # for debugging
            }
        )
    
    def _create_error_response(self, error_message: str) -> EnergyQueryResponse:
        """Create an error response with the given message."""
        return EnergyQueryResponse(
            summary=f"I'm sorry, I encountered an error processing your request: {error_message}",
            data={
                "error": error_message,
                "status": "error"
            },
            metadata={
                "error": True,
                "timestamp": datetime.utcnow().isoformat()
            }
        )
