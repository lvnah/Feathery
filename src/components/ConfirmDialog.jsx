import { Modal } from './ui';
import { run } from '../views/ServerView';

// Confirmation dans le style de l'appli (remplace les fenêtres du navigateur).
export default function ConfirmDialog({ pending, onClose, toast }) {
  if (!pending) return null;
  const confirm = async () => {
    const ok = await run(toast, pending.action);
    if (ok !== false) onClose();
  };
  return (
    <Modal open title={pending.title} onClose={onClose} width="max-w-md">
      <div className="flex flex-col gap-5">
        <p className="text-sm text-slate-600">{pending.message}</p>
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={onClose} className="btn-ghost min-h-[48px]">Annuler</button>
          <button type="button" onClick={confirm} className="btn-danger min-h-[48px]">{pending.label}</button>
        </div>
      </div>
    </Modal>
  );
}
