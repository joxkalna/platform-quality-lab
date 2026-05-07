import { useState } from "react";

type SectionProps = {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
};

const Section = ({ title, defaultOpen = false, children }: SectionProps) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="section-wrapper">
      <button onClick={() => setOpen(!open)} className="section-header">
        <h2 className="section-title">{title}</h2>
        <span className={`section-chevron ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {open && <div className="section-body">{children}</div>}
    </section>
  );
};

export default Section;
