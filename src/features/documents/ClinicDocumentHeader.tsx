type ClinicProfile = {
  name: string;
  address: string;
  city: string;
  governorate: string;
  phone: string;
  email: string;
};

type Props = {
  clinic: ClinicProfile;
  title: string;
  subtitle: string;
  number: string;
  date: string;
  dateLabel?: string;
};

export function ClinicDocumentHeader({ clinic, title, subtitle, number, date, dateLabel = "Date" }: Props) {
  const address = [clinic.address, clinic.city, clinic.governorate].filter(Boolean).join(" · ");
  return (
    <header className="clinic-document-header">
      <div className="clinic-document-identity">
        <p className="clinic-document-name">{clinic.name}</p>
        <p className="clinic-document-subtitle">{subtitle}</p>
        {(address || clinic.phone || clinic.email) && (
          <div className="clinic-document-contact">
            {address && <p>{address}</p>}
            {clinic.phone && <p>{clinic.phone}</p>}
            {clinic.email && <p>{clinic.email}</p>}
          </div>
        )}
      </div>
      <div className="clinic-document-reference">
        <h1>{title}</h1>
        <p><strong>N° :</strong> {number}</p>
        <p><strong>{dateLabel} :</strong> {date}</p>
      </div>
    </header>
  );
}
