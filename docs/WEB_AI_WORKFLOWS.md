# Web AI workflows

The sample Gemini workflow is draft-only. It avoids sending a prompt. To send messages, a workflow must explicitly include `send_message` and the user must approve the action.

Common safe actions: read page, open tool/model menus, type a draft, verify draft, clear draft. Risky actions: send, upload private files, download/export private outputs, publish/share/delete/change account settings.
