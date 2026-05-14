import { ProductForm } from "@/components/ProductForm";

export default function NewProductPage() {
  return (
    <div className="container-pro py-10 max-w-3xl">
      <h1 className="font-serif text-3xl">Add product</h1>
      <p className="text-sm text-ink-muted mt-1">Save as draft, then submit for admin approval.</p>
      <div className="card mt-6 p-6">
        <ProductForm />
      </div>
    </div>
  );
}
