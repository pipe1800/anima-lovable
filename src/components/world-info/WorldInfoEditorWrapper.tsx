import { useParams } from 'react-router-dom';
import WorldInfoEditor from './WorldInfoEditor';

export default function WorldInfoEditorWrapper() {
  const { id } = useParams<{ id: string }>();
  
  return <WorldInfoEditor mode="edit" worldInfoId={id} />;
}
