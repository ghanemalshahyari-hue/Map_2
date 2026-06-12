import requests
import json

url = "http://localhost:4000/chat/completions"
headers = {
    "Authorization": "Bearer sk-pDzYMER5qTMM0XJLiIBojg", # Normal user 1 (2k TPM limit)
    "Content-Type": "application/json"
}

# Create a prompt that is roughly 2500 words long. 
# 1 word is typically ~1.3 tokens, so 2500 words is ~3200 tokens.
# This guarantees it exceeds the 2000 TPM limit on the very first request.
large_prompt = "hello " * 2500

payload = {
    "model": "vllm-model",
    "messages": [
        {"role": "user", "content": large_prompt}
    ]
}

print("Sending request with roughly 2500 tokens to LiteLLM...")
response = requests.post(url, headers=headers, json=payload)

print("\n--- Response Status Code ---")
print(response.status_code)

print("\n--- Response Body ---")
try:
    print(json.dumps(response.json(), indent=2))
except Exception:
    print(response.text)
