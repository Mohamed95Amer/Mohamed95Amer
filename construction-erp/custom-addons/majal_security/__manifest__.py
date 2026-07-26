{
    "name": "Majal Security Baseline",
    "summary": "Password policy, passkeys and configurable multi-factor authentication",
    "version": "18.0.1.0.0",
    "category": "Hidden/Tools",
    "license": "LGPL-3",
    "author": "Majal",
    "depends": [
        "auth_password_policy",
        "auth_passkey",
        "auth_totp_mail_enforce",
    ],
    "data": [
        "data/security_defaults.xml",
    ],
    "application": False,
    "installable": True,
}
