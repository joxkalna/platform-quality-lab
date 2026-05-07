type ErrorMessageProps = {
  message: string;
};

const ErrorMessage = ({ message }: ErrorMessageProps) => (
  <div className="error-message">{message}</div>
);

export default ErrorMessage;
