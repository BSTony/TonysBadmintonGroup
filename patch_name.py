import re

with open('public/app.js', 'r', encoding='utf-8') as f:
    content = f.read()

target = r"let mockName = 'Test Player ' + randomSuffix;"
replacement = r"let mockName = testParams.get('name') || ('Test Player ' + randomSuffix);"

if target in content:
    content = content.replace(target, replacement)
    with open('public/app.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Added custom ?name support to app.js")
