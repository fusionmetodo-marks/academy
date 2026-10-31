import re

with open('src/App.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Add import
content = content.replace("import Login from './pages/Login';", "import PushNotificationPrompt from './components/PushNotificationPrompt';\nimport Login from './pages/Login';")

# Add the component to render tree
content = content.replace("""    <BrowserRouter>
      <div className="min-h-screen">
""", """    <BrowserRouter>
      {user && <PushNotificationPrompt />}
      <div className="min-h-screen">
""")

with open('src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated App.tsx")
