import json
import sys
from pathlib import Path
import tweepy
from src.settings import settings, ROOT_DIR

def update_env(access_token, refresh_token):
    env_path = ROOT_DIR / ".env"
    if not env_path.exists():
        print(f"Warning: .env file not found at {env_path}")
        return
        
    lines = env_path.read_text(encoding="utf-8").splitlines()
    updated = []
    
    has_access = False
    has_refresh = False
    
    for line in lines:
        if line.startswith("X2_OAUTH2_ACCESS_TOKEN="):
            updated.append(f"X2_OAUTH2_ACCESS_TOKEN={access_token}")
            has_access = True
        elif line.startswith("X2_OAUTH2_REFRESH_TOKEN="):
            updated.append(f"X2_OAUTH2_REFRESH_TOKEN={refresh_token}")
            has_refresh = True
        else:
            updated.append(line)
            
    if not has_access:
        updated.append(f"X2_OAUTH2_ACCESS_TOKEN={access_token}")
    if not has_refresh:
        updated.append(f"X2_OAUTH2_REFRESH_TOKEN={refresh_token}")
        
    env_path.write_text("\n".join(updated) + "\n", encoding="utf-8")
    print("✅ Updated .env file variables.")

def main():
    if len(sys.argv) < 2:
        print("Usage: python exchange_x2_code.py <redirected_url>")
        sys.exit(1)
        
    redirected_url = sys.argv[1]
    
    temp_file = ROOT_DIR / "storage" / "x2_temp_verifier.json"
    if not temp_file.exists():
        print("Error: Temporary verifier file not found. Please generate a new auth URL first.")
        sys.exit(1)
        
    try:
        temp_data = json.loads(temp_file.read_text(encoding="utf-8"))
        code_verifier = temp_data["code_verifier"]
        state = temp_data["state"]
        redirect_uri = temp_data["redirect_uri"]
    except Exception as e:
        print(f"Error loading temp verifier: {e}")
        sys.exit(1)
        
    client_id = settings.x2_client_id
    client_secret = settings.x2_client_secret
    
    oauth2_user_handler = tweepy.OAuth2UserHandler(
        client_id=client_id,
        redirect_uri=redirect_uri,
        scope=["tweet.read", "tweet.write", "users.read", "offline.access"],
        client_secret=client_secret
    )
    
    oauth2_user_handler._client.code_verifier = code_verifier
    oauth2_user_handler._client.state = state
    
    try:
        print("Exchanging authorization code...")
        tokens = oauth2_user_handler.fetch_token(redirected_url)
        
        access_token = tokens.get("access_token")
        refresh_token = tokens.get("refresh_token")
        
        if not access_token or not refresh_token:
            raise ValueError(f"Missing access_token or refresh_token in response: {tokens}")
            
        # Save to token storage file
        token_file = ROOT_DIR / "storage" / "x2_oauth2_tokens.json"
        token_file.parent.mkdir(parents=True, exist_ok=True)
        token_file.write_text(json.dumps({
            "access_token": access_token,
            "refresh_token": refresh_token,
            "updated_at": tokens.get("expires_at", "") or "",
        }, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"✅ Saved tokens to {token_file.name}")
        
        # Update .env
        update_env(access_token, refresh_token)
        
        # Clean up temp file
        if temp_file.exists():
            temp_file.unlink()
            print("Deleted temporary verifier.")
            
        print("\n🎉 X2 (AZDAG X Account) authorization successful!")
    except Exception as e:
        print(f"Error exchanging token: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
