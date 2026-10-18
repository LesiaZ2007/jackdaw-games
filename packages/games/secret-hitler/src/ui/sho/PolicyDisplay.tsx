import { A } from './assets';
import { LIBERAL, type PolicyType } from './types';

/** secret-hitler.online's util/PolicyDisplay.js: a row of policy cards, optionally selectable. */
export default function PolicyDisplay({
  policies,
  onClick = () => {},
  selection,
  allowSelection,
}: {
  policies: PolicyType[];
  onClick?: (index: number) => void;
  selection?: number;
  allowSelection?: boolean;
}) {
  return (
    <div id="legislative-policy-container">
      {policies.map((value, index) => {
        const policyName = value === LIBERAL ? 'liberal' : 'fascist';
        return (
          <img
            id="legislative-policy"
            key={index}
            className={
              allowSelection ? 'selectable ' + (index === selection ? ' selected' : '') : ''
            }
            onClick={() => onClick(index)}
            {...{ disabled: !allowSelection }}
            src={value === LIBERAL ? A.policyLiberal : A.policyFascist}
            alt={'A ' + policyName + ' policy.' + (allowSelection ? ' Click to select.' : '')}
          />
        );
      })}
    </div>
  );
}
