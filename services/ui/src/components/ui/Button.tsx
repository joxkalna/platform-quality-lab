type ButtonProps = {
  variant?: "primary" | "secondary";
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
};

const variants = {
  primary: "btn btn-primary",
  secondary: "btn btn-secondary",
};

const Button = ({ variant = "primary", disabled, onClick, children }: ButtonProps) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={variants[variant]}
  >
    {children}
  </button>
);

export default Button;
