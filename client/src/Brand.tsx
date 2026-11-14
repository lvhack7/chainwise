import { Icon } from './Icon'

export function Brand() {
  return <a className="brand" href="/" aria-label="Chainwise home"><span className="brand-mark"><Icon name="agent"/></span><span className="brand-name">Chain<span className="brand-accent">wise</span></span></a>
}
