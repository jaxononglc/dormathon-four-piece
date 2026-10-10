import { useEffect } from 'react';
import { X } from 'lucide-react';

export default function Modal({ title, subtitle, icon, onClose, width = 600, children, footer, className = '' }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${className}`} style={{ maxWidth: width }} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal__header">
          {icon && <div className="modal__icon">{icon}</div>}
          <div className="modal__titles">
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        {children}
        {footer && <div className="modal__footer">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, message, confirmLabel = 'Delete', onConfirm, onClose }) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      width={420}
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn--danger" onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</button>
        </>
      }
    >
      <div className="modal__body">
        <p className="muted">{message}</p>
      </div>
    </Modal>
  );
}
