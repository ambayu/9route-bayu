import os
import re
import json

def clean_toml(content):
    content = re.sub(r'model_provider\s*=\s*"9router"\s*\n?', '', content)
    content = re.sub(r'\[model_providers\.9router\](?:[\s\S]*?)(?=\n\[|\Z)', '', content)
    content = re.sub(r'\[agents\.subagent\](?:[\s\S]*?)(?=\n\[|\Z)', '', content)
    return content.strip() + "\n"

def get_vps_url():
    fallback = "https://lppm.umnaw.ac.id/route9/v1"
    # Find .env in the script's directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    env_path = os.path.join(script_dir, ".env")
    if os.path.exists(env_path):
        try:
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    if line.startswith("BASE_URL=") or line.startswith("NEXT_PUBLIC_BASE_URL="):
                        val = line.split("=", 1)[1].strip().strip("'").strip('"')
                        if val and "localhost" not in val and "127.0.0.1" not in val:
                            # Normalize /v1 suffix
                            val = val.rstrip("/")
                            return val if val.endswith("/v1") else f"{val}/v1"
        except Exception:
            pass
    return fallback

def main():
    config_path = os.path.expanduser(r"~\\.codex\\config.toml")
    auth_path = os.path.expanduser(r"~\\.codex\\auth.json")
    
    if not os.path.exists(config_path):
        print(f"Codex config file not found at {config_path}")
        print("Please configure Codex through the dashboard first to generate the file.")
        return
        
    vps_url = get_vps_url()
    
    print("=========================================")
    print("   Codex Endpoint Switcher (9Router)")
    print("=========================================")
    print("Select target 9Router server:")
    print(" [1] Local 9Router (http://localhost:20127/v1)")
    print(" [2] VPS 9Router   (" + vps_url + ")")
    print(" [3] Original Codex API (Default Official)")
    print("=========================================")
    
    choice = input("Enter choice (1, 2, or 3): ").strip()
    
    if choice == "3":
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                content = f.read()
            cleaned_content = clean_toml(content)
            with open(config_path, "w", encoding="utf-8") as f:
                f.write(cleaned_content)
            
            if os.path.exists(auth_path):
                with open(auth_path, "r", encoding="utf-8") as f:
                    auth_data = json.load(f)
                
                auth_data.pop("OPENAI_API_KEY", None)
                auth_data.pop("auth_mode", None)
                
                if not auth_data:
                    os.remove(auth_path)
                else:
                    with open(auth_path, "w", encoding="utf-8") as f:
                        json.dump(auth_data, f, indent=2)
                        
            print("\n[SUCCESS] Codex config restored to original official settings.")
        except Exception as e:
            print(f"Failed to restore official settings: {e}")
        return
        
    if choice == "1":
        new_url = "http://localhost:20127/v1"
        label = "Local 9Router"
    elif choice == "2":
        new_url = vps_url
        label = "VPS 9Router"
    else:
        print("Invalid choice. Exiting.")
        return
        
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            content = f.read()
            
        if 'model_provider = "9router"' not in content:
            content += '\nmodel_provider = "9router"\n\n[model_providers.9router]\nname = "9Router"\nbase_url = ""\nwire_api = "responses"\n'
            
        pattern = r'(base_url\s*=\s*")[^"]*(")'
        content = re.sub(pattern, rf'\g<1>{new_url}\g<2>', content)
            
        with open(config_path, "w", encoding="utf-8") as f:
            f.write(content)
            
        print(f"\n[SUCCESS] Codex config updated to point to: {label} ({new_url})")
        
    except Exception as e:
        print(f"Failed to update config.toml: {e}")

if __name__ == '__main__':
    main()
