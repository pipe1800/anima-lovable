import { useParams } from 'react-router-dom';
import UnifiedWorldInfoEditor from './UnifiedWorldInfoEditor';

export default function UnifiedWorldInfoEditorWrapper() {
  const { id } = useParams<{ id: string }>();
  
  return <UnifiedWorldInfoEditor mode="edit" worldInfoId={id} />;
}
