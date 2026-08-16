"""Install hooks must match the signature Odoo 18 actually calls them with.

A wrong hook signature is not a local failure. Hooks run inside
load_module_graph, so the TypeError propagates out of the registry load and
aborts the whole install — every module, not just the one that owns the hook.
majal_report_studio shipped post_init_hook(cr, _registry), the pre-17 form,
and both CI jobs died on it: the test suite could not build a database and the
demo install could not either.

The module's own unit test could not have caught it, because it called the
seeding method directly and never went through the hook. That is the gap this
closes: it checks the wiring rather than the thing being wired.

Odoo 18 calls every one of these with a single argument, an Environment — see
odoo/modules/loading.py, which does getattr(py_module, post_init)(env). So the
check is that each hook accepts exactly one positional parameter.

A hook does not have to be *named* post_init_hook. The manifest key holds the
function name, and this repo already has two that use their own:
facility_asset declares pre_init_secure_asset_tags and facility_sla declares
post_init_assign_sla. Collecting only the conventional names would have left
those two unchecked — which is the same blind spot in a different place, since
a pre-17 signature there would abort the registry just as thoroughly. So the
names to look for are the standard three plus whatever every manifest
declares.
"""

import ast
from pathlib import Path

HOOK_KEYS = ("post_init_hook", "pre_init_hook", "uninstall_hook")
ADDONS_ROOT = Path(__file__).resolve().parents[2]

from odoo.tests import TransactionCase, tagged  # noqa: E402


def _manifests():
    for manifest_path in sorted(ADDONS_ROOT.glob("*/__manifest__.py")):
        try:
            manifest = ast.literal_eval(
                manifest_path.read_text(encoding="utf-8"))
        except (ValueError, SyntaxError):
            continue
        if isinstance(manifest, dict):
            yield manifest_path.parent.name, manifest


def _declared_hooks():
    """{module: {function name: manifest key}} for every declared hook."""
    declared = {}
    for module, manifest in _manifests():
        for key in HOOK_KEYS:
            name = manifest.get(key)
            if name:
                declared.setdefault(module, {})[name] = key
    return declared


@tagged("post_install", "-at_install")
class TestInstallHookSignatures(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.declared = _declared_hooks()
        # Look for the conventional names everywhere, plus any custom name a
        # manifest declares. Read with ast rather than importing: importing
        # every addon outside its own install context is exactly the kind of
        # side effect a test should not cause.
        cls.definitions = {}
        for module_dir in sorted(ADDONS_ROOT.glob("*/")):
            module = module_dir.name
            wanted = set(HOOK_KEYS) | set(cls.declared.get(module, {}))
            for path in (module_dir / "__init__.py", module_dir / "hooks.py"):
                if not path.exists():
                    continue
                try:
                    tree = ast.parse(path.read_text(encoding="utf-8"))
                except SyntaxError:  # pragma: no cover
                    continue
                for node in tree.body:
                    if not isinstance(node, ast.FunctionDef):
                        continue
                    if node.name not in wanted:
                        continue
                    args = node.args
                    cls.definitions[(module, node.name)] = (
                        path, [a.arg for a in args.posonlyargs + args.args])

    def test_every_install_hook_takes_exactly_one_argument(self):
        self.assertTrue(
            self.definitions, "no install hooks discovered — the scan is broken")

        wrong = [
            f"{module}/{path.name}::{name}({', '.join(params)})"
            for (module, name), (path, params) in sorted(self.definitions.items())
            if len(params) != 1
        ]
        self.assertFalse(
            wrong,
            "Odoo 18 calls install hooks with a single Environment argument. "
            "These use another signature and will abort the whole registry "
            "load, not just their own module: " + "; ".join(wrong),
        )

    def test_custom_named_hooks_are_covered_by_that_check(self):
        """The check above is only worth having if it reaches the hooks that
        do not use a conventional name — the two in this repo that do not."""
        for module, names in self.declared.items():
            for name in names:
                self.assertIn(
                    (module, name), self.definitions,
                    f"{module} declares a hook named {name!r} that the scan "
                    f"did not find, so its signature is unchecked")

    def test_declared_hooks_exist_in_the_module_that_names_them(self):
        """A manifest naming a hook that is not defined fails at install time
        with an AttributeError, in the same place and just as fatally."""
        missing = [
            f"{module} declares {key}={name!r} but nothing defines it"
            for module, names in sorted(self.declared.items())
            for name, key in sorted(names.items())
            if (module, name) not in self.definitions
        ]
        self.assertFalse(missing, "; ".join(missing))
