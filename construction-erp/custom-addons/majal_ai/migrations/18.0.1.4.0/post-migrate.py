def migrate(cr, version):
    """Move the shipped local profile to the installed Ollama model safely."""
    from odoo import api, SUPERUSER_ID

    env = api.Environment(cr, SUPERUSER_ID, {})
    general = env.ref("majal_ai.provider_local", raise_if_not_found=False)
    if general and general.model_name in {"qwen3:8b", "qwen2.5:7b"}:
        general.write({"name": "Ollama General", "model_name": "gpt-oss:20b"})
