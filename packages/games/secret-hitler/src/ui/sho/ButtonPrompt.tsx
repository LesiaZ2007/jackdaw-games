import type { ReactNode } from 'react';

/**
 * secret-hitler.online's custom-alert/ButtonPrompt.js: a label, a header line, the content, a
 * footer line and a button. Each part can be replaced with a render function.
 */
export type ButtonPromptProps = {
  label?: string;
  renderLabel?: () => ReactNode;
  headerText?: string;
  renderHeader?: () => ReactNode;
  footerText?: string;
  renderFooter?: () => ReactNode;
  buttonText?: string;
  buttonOnClick?: () => void;
  buttonDisabled?: boolean;
  renderButton?: () => ReactNode;
  children?: ReactNode;
};

export default function ButtonPrompt({
  label = 'LABEL GOES HERE',
  renderLabel,
  headerText = '',
  renderHeader,
  footerText = '',
  renderFooter,
  buttonText = 'CONFIRM',
  buttonOnClick = () => {},
  buttonDisabled = false,
  renderButton,
  children,
}: ButtonPromptProps) {
  return (
    <div>
      {renderLabel ? (
        renderLabel()
      ) : (
        <h2 id="prompt-label" className="left-align">
          {label}
        </h2>
      )}
      {renderHeader ? (
        renderHeader()
      ) : (
        <p id="prompt-header" className="left-align">
          {headerText}
        </p>
      )}
      {children}
      {renderFooter ? (
        renderFooter()
      ) : (
        <p id="prompt-header" className="left-align">
          {footerText}
        </p>
      )}
      {renderButton ? (
        renderButton()
      ) : (
        <button id="prompt-button" disabled={buttonDisabled} onClick={buttonOnClick}>
          {buttonText}
        </button>
      )}
    </div>
  );
}
