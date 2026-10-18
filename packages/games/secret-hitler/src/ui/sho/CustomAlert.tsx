import type { ReactNode } from 'react';

/** secret-hitler.online's custom-alert/CustomAlert.js: the dimmed overlay and the black box. */
export default function CustomAlert({ show, children }: { show: boolean; children: ReactNode }) {
  const cls = show ? 'appear-custom-alert' : 'disappear-custom-alert';
  return (
    <div id="alert" className={cls}>
      <div id="alert-background" className={cls} />
      <div id="alert-box" className={cls} role={show ? 'dialog' : undefined} aria-modal={show}>
        {children}
      </div>
    </div>
  );
}
