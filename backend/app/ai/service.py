"""
AI Service Layer.
Handles business logic for AI interactions and coordinates between providers.
"""
import logging
import json
import time
import uuid
from typing import Dict, Any, List, Optional

from sqlalchemy.orm import Session
from .providers import AIProvider, TogetherAIProvider
from .chat_schemas import ChatRequest, ChatResponse, ErrorResponse, EnergyQueryResponse
from .energy_service import EnergyQueryProcessor
from .data.energy_repository import EnergyRepository

logger = logging.getLogger(__name__)

class AIService:
    """Service layer for AI operations."""

    def __init__(self, db_session: Session):
        """
        Initialize the AI service with a database session.

        Args:
            db_session: A SQLAlchemy database session.
        """
        self.db_session = db_session
        # In a real app, you'd inject a real provider from a config or factory
        self.provider: AIProvider = TogetherAIProvider()

        # Create the repository with the live database session
        energy_repo = EnergyRepository(db=self.db_session)

        # Inject the provider and the live repository into the processor
        self.energy_query_processor = EnergyQueryProcessor(
            ai_provider=self.provider,
            energy_repo=energy_repo
        )
    
    async def chat(self, user_id: int, request: ChatRequest) -> Dict[str, Any]:
        """
        Process a chat message and return the AI's response.
        
        Args:
            messages: List of message dictionaries with 'role' and 'content'.
            temperature: Controls randomness (0.0 to 1.0).
            max_tokens: Maximum number of tokens to generate.
            **kwargs: Additional parameters for the provider.
            
        Returns:
            Dictionary containing the model's response.
        """
        try:
            # Get the latest user message
            user_message = next((msg for msg in reversed(request.messages) if msg.role == 'user'), None)

            # Check if this is an energy-related query
            if user_message and self._is_energy_query(user_message.content):
                return await self._handle_energy_query(user_id, user_message.content)
                
            # For non-energy queries, use the standard chat flow
            response = await self.provider.chat_completion(
                messages=[msg.model_dump() for msg in request.messages],
                temperature=request.temperature,
                max_tokens=request.max_tokens
            )
            
            # Add any post-processing of the response here
            if "error" in response:
                return {
                    "error": response["error"],
                    "status_code": response.get("status_code", 500)
                }
                
            return response
            
        except Exception as e:
            logger.error(f"Error in chat completion: {str(e)}", exc_info=True)
            raise
    
    def _is_energy_query(self, query: str) -> bool:
        """Determine if a query is about energy usage."""
        energy_keywords = [
            'energy', 'power', 'electricity', 'usage', 'consumption',
            'kwh', 'kilowatt', 'watt', 'bill', 'cost', 'how much',
            'ac', 'air conditioner', 'appliance', 'device', 'tv', 'fridge'
        ]
        query = query.lower()
        return any(keyword in query for keyword in energy_keywords)
    
    async def _handle_energy_query(self, user_id: int, query: str) -> Dict[str, Any]:
        """Process an energy-related query with structured response."""
        try:
            # Process the energy query
            response = await self.energy_query_processor.process_query(user_id, query)
            
            # The response is a Pydantic model. Use .model_dump_json() for safe serialization.
            response_content = response.model_dump_json(indent=2)
            logger.info(f"Structured energy response:\n{response_content}")

            # Construct a response that conforms to the ChatResponse schema
            return {
                'id': f'chatcmpl-energy-{uuid.uuid4().hex}',
                'object': 'chat.completion',
                'created': int(time.time()),
                'model': 'energy-query-processor',
                'choices': [{
                    'index': 0,
                    'message': {
                        'role': 'assistant',
                        'content': response_content
                    },
                    'finish_reason': 'stop'
                }],
                'usage': {
                    'prompt_tokens': 0, # Simplified for now
                    'completion_tokens': 0,
                    'total_tokens': 0
                },
                'structured_data': response
            }
            
        except Exception as e:
            logger.error(f"Error processing energy query: {str(e)}", exc_info=True)
            # Return a proper error response that conforms to the schema
            error_content = f"I'm sorry, I encountered an error processing your energy query: {str(e)}"
            return {
                'id': f'chatcmpl-error-{uuid.uuid4().hex}',
                'object': 'chat.completion',
                'created': int(time.time()),
                'model': 'energy-query-processor',
                'choices': [{
                    'index': 0,
                    'message': {
                        'role': 'assistant',
                        'content': error_content
                    },
                    'finish_reason': 'stop'
                }],
                'usage': {
                    'prompt_tokens': 0,
                    'completion_tokens': 0,
                    'total_tokens': 0
                }
            }
    
    async def close(self) -> None:
        """Clean up resources used by the service and its provider."""
        await self.provider.close()
    

