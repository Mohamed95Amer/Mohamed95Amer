export default function ContactPage() {
  return (
    <div className="container-pro py-12 max-w-2xl">
      <h1 className="font-serif text-4xl">Contact</h1>
      <p className="text-ink-muted mt-2">
        For onboarding, verification, or support please email{" "}
        <a className="underline" href="mailto:hello@goldhub.example">hello@goldhub.example</a>.
      </p>
      <div className="card mt-8 p-6 space-y-3">
        <p className="text-sm"><span className="text-ink-muted">Customer support:</span> support@goldhub.example</p>
        <p className="text-sm"><span className="text-ink-muted">Vendor onboarding:</span> vendors@goldhub.example</p>
        <p className="text-sm"><span className="text-ink-muted">Compliance:</span> compliance@goldhub.example</p>
      </div>
    </div>
  );
}
