type DataFieldProps = {
  label: string;
  value: string;
};

const DataField = ({ label, value }: DataFieldProps) => (
  <div>
    <span className="data-field-label">{label}</span>
    <p className="data-field-value">{value}</p>
  </div>
);

export default DataField;
