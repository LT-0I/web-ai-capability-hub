# Define the SVG content
svg_content = """<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="1024" fill="#0000FF" />
  <circle cx="512" cy="512" r="400" fill="#FFFF00" />
</svg>"""

# Save to a file
file_path = 'yellow_circle_blue_square.svg'
with open(file_path, 'w') as f:
    f.write(svg_content)

print(f"File saved to {file_path}")