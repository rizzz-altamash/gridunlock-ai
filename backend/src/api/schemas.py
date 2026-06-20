# backend/src/api/schemas.py 
from pydantic import BaseModel, Field

class PredictionRequest(BaseModel):
    latitude: float = Field(..., description="Latitude of the location")
    longitude: float = Field(..., description="Longitude of the location")
    hour: int = Field(..., ge=0, le=23, description="Hour of the day in 24h format")
    day_of_week: str = Field(..., description="Full string day of the week (e.g., 'Monday')")
    junction_name: str = Field(default="No Junction", description="Name of the junction")

class PredictionResponse(BaseModel):
    impact_score: float
    priority: str
    recommended_action: str
    hex_id: str
    is_hotspot: bool

