import json

with open('package.json', 'r') as f:
    data = json.load(f)

data['scripts']['dev'] = "tsx server.ts"
data['scripts']['build'] = "vite build && esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs"
data['scripts']['start'] = "node dist/server.cjs"

with open('package.json', 'w') as f:
    json.dump(data, f, indent=2)

print("Updated package.json scripts")
