from datetime import date

from pydantic import BaseModel, Field


class UserUpdateRequest(BaseModel):
    full_name: str | None = Field(None, min_length=1, max_length=255)
    avatar_url: str | None = Field(None, max_length=500)
    date_of_birth: date | None = None
