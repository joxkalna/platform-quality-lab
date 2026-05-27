type ErrorMessageProps = {
  message: string;
};

const ErrorMessage = ({ message }: ErrorMessageProps) => (
  <div role="alert" className="error-message">{message}</div>
);

export default ErrorMessage;
