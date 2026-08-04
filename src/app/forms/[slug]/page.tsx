"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";

interface FormData {
  id: string;
  name: string;
  fields: Array<{ name: string; label: string; type: string; required: boolean; options?: string[] }>;
  redirectUrl: string | null;
}

export default function PublicFormPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [form, setForm] = useState<FormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/public/lead-forms?slug=${slug}`);
      if (!res.ok) throw new Error("Form not found");
      const data = await res.json();
      setForm(data.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`/api/public/lead-forms?slug=${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, _honeypot: values._honeypot || "" }),
      });
      if (!res.ok) throw new Error("Submission failed");
      setSuccess(true);
      if (form?.redirectUrl) {
        setTimeout(() => { window.location.href = form.redirectUrl!; }, 1500);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0b0f", color: "#8b8d98" }}>Loading...</div>;
  if (error) return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0b0f", color: "#e57373", flexDirection: "column", gap: 16 }}><p>{error}</p></div>;
  if (success) return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0b0f", color: "#4ade80", flexDirection: "column", gap: 16 }}><p style={{ fontSize: 24, fontWeight: 700 }}>✓ Thank you!</p><p style={{ color: "#8b8d98" }}>We'll be in touch soon.</p></div>;

  if (!form) return null;

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 12px", borderRadius: 8,
    border: "1px solid #2a2e3a", backgroundColor: "#12141a", color: "#e8e8ec",
    fontSize: 15, boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "#8b8d98" };

  return (
    <div style={{ minHeight: "100vh", background: "#0a0b0f", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 480, width: "100%", background: "#1a1d26", border: "1px solid #2a2e3a", borderRadius: 16, padding: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#e8e8ec", marginBottom: 24 }}>{form.name}</h1>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Honeypot field — hidden from humans */}
          <input type="text" name="_honeypot" value={values._honeypot || ""} onChange={e => setValues({ ...values, _honeypot: e.target.value })} style={{ display: "none" }} tabIndex={-1} autoComplete="off" />

          {form.fields.map((field) => (
            <div key={field.name}>
              <label style={labelStyle}>{field.label}{field.required && " *"}</label>
              {field.type === "textarea" ? (
                <textarea style={{ ...inputStyle, minHeight: 80, resize: "vertical" }} value={values[field.name] || ""} onChange={e => setValues({ ...values, [field.name]: e.target.value })} required={field.required} />
              ) : field.type === "select" ? (
                <select style={inputStyle} value={values[field.name] || ""} onChange={e => setValues({ ...values, [field.name]: e.target.value })} required={field.required}>
                  <option value="">Select...</option>
                  {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              ) : (
                <input type={field.type} style={inputStyle} value={values[field.name] || ""} onChange={e => setValues({ ...values, [field.name]: e.target.value })} required={field.required} />
              )}
            </div>
          ))}
          <button type="submit" disabled={submitting} style={{
            padding: "12px 20px", borderRadius: 8, border: "none",
            backgroundColor: "#c9a96e", color: "#0a0b0f", fontWeight: 600,
            fontSize: 15, cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.7 : 1,
          }}>
            {submitting ? "Submitting..." : "Submit"}
          </button>
        </form>
      </div>
    </div>
  );
}