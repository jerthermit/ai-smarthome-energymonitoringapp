from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_active_user
from app.auth import models, schemas, service

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/register", response_model=schemas.UserInDB)
def register_user(
    user_in: schemas.UserCreate,
    db: Session = Depends(get_db)
):
    """Register a new user"""
    db_user = service.get_user_by_email(db, email=user_in.email)
    if db_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    return service.create_user(db=db, user=user_in)

@router.post("/login", response_model=schemas.Token)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """OAuth2 compatible token login, get an access token for future requests"""
    user = service.authenticate_user(
        db, email=form_data.username, password=form_data.password
    )
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return {
        "access_token": service.create_access_token_for_user(user),
        "token_type": "bearer",
    }

@router.get("/me", response_model=schemas.UserInDB)
def read_users_me(
    current_user: models.User = Depends(get_current_active_user)
):
    """Get current user information"""
    return current_user

@router.put("/me", response_model=schemas.UserInDB)
def update_user_me(
    user_in: schemas.UserUpdate,
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Update current user information"""
    return service.update_user(db, db_user=current_user, user_update=user_in)
