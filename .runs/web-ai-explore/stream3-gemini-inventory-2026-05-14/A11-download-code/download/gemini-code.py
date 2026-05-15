# Create a small Python file that prints "Hello World"
content = 'print("Hello World")\n'

file_path = 'hello_world.py'

with open(file_path, 'w') as f:
    f.write(content)

print(f"File saved to {file_path}")