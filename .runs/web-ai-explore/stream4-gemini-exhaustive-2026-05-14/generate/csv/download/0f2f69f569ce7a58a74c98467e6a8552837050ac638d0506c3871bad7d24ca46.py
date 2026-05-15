import pandas as pd

# Define the data for 5 capital cities
data = {
    'name': ['Tokyo', 'Delhi', 'Cairo', 'Mexico City', 'London'],
    'country': ['Japan', 'India', 'Egypt', 'Mexico', 'United Kingdom'],
    'population': [37435191, 32941308, 22183200, 22281442, 9648110],
    'area_km2': [2194, 1484, 3085, 1485, 1572]
}

# Create a DataFrame
df = pd.DataFrame(data)

# Save to CSV
file_path = 'capitals.csv'
df.to_csv(file_path, index=False)

print(f'File saved to {file_path}')