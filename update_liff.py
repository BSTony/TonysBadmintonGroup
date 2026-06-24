import sys

with open('index.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace sendLobbyLink to include gid in query string
old_liff_msg = "https://liff.line.me/${process.env.LIFF_ID}"
new_liff_msg = "https://liff.line.me/${process.env.LIFF_ID}?gid=${gid}"

if old_liff_msg in content:
    content = content.replace(old_liff_msg, new_liff_msg)
    with open('index.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Updated sendLobbyLink")
else:
    print("Could not find sendLobbyLink LIFF string")
