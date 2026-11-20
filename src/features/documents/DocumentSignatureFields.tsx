type Props = {
  locale: "fr" | "ar";
  includePatientApproval?: boolean;
};

export function DocumentSignatureFields({ locale, includePatientApproval = false }: Props) {
  const label = (fr: string, ar: string) => locale === "ar" ? ar : fr;

  return (
    <section className={`document-signature-fields${includePatientApproval ? " document-signature-fields-with-patient" : ""}`}>
      <div className="document-signature-field">
        <p>{label("Signature du praticien", "توقيع الطبيب")}</p>
      </div>
      <div className="document-signature-field document-stamp-field">
        <p>{label("Cachet du cabinet", "ختم العيادة")}</p>
      </div>
      {includePatientApproval && (
        <div className="document-signature-field">
          <p>{label("Bon pour accord — signature du patient", "موافق — توقيع المريض")}</p>
        </div>
      )}
    </section>
  );
}
