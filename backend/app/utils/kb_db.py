from typing import Dict, List, Any
from app.db.database import SessionLocal
from app.db.models import Course, Module, Node, Resource

def get_tree() -> List[dict]:
    db = SessionLocal()
    try:
        courses = db.query(Course).all()
        tree = []
        for c in courses:
            c_dict = {
                "id": c.id,
                "title": c.title,
                "type": "course",
                "dify_dataset_id": c.dify_dataset_id,
                "children": []
            }
            for m in c.modules:
                m_dict = {
                    "id": m.id,
                    "title": m.title,
                    "type": "module",
                    "children": []
                }
                for n in m.nodes:
                    n_dict = {
                        "id": n.id,
                        "title": n.title,
                        "type": "node"
                    }
                    m_dict["children"].append(n_dict)
                c_dict["children"].append(m_dict)
            tree.append(c_dict)
        return tree
    finally:
        db.close()

def add_course(title: str, dify_dataset_id: str) -> dict:
    db = SessionLocal()
    try:
        new_course = Course(title=title, dify_dataset_id=dify_dataset_id)
        db.add(new_course)
        db.commit()
        db.refresh(new_course)
        return {
            "id": new_course.id,
            "title": new_course.title,
            "type": "course",
            "dify_dataset_id": new_course.dify_dataset_id,
            "children": []
        }
    finally:
        db.close()

def add_module(course_id: str, title: str) -> dict:
    db = SessionLocal()
    try:
        new_module = Module(course_id=course_id, title=title)
        db.add(new_module)
        db.commit()
        db.refresh(new_module)
        return {
            "id": new_module.id,
            "title": new_module.title,
            "type": "module",
            "children": []
        }
    finally:
        db.close()

def add_node(module_id: str, title: str) -> dict:
    db = SessionLocal()
    try:
        new_node = Node(module_id=module_id, title=title)
        db.add(new_node)
        db.commit()
        db.refresh(new_node)
        return {
            "id": new_node.id,
            "title": new_node.title,
            "type": "node"
        }
    finally:
        db.close()

def get_dataset_id_for_course(course_id: str) -> str:
    db = SessionLocal()
    try:
        c = db.query(Course).filter(Course.id == course_id).first()
        return c.dify_dataset_id if c else None
    finally:
        db.close()


def get_node_context(node_id: str) -> str:
    """Keep generic node labels such as '1' within their actual course topic."""
    with SessionLocal() as db:
        node = db.query(Node).filter(Node.id == node_id).first()
        if node:
            return f"{node.module.course.title} / {node.module.title} / {node.title}"
        module = db.query(Module).filter(Module.id == node_id).first()
        if module:
            return f"{module.course.title} / {module.title}"
        course = db.query(Course).filter(Course.id == node_id).first()
        return course.title if course else "核心知识"

def delete_tree_node(node_id: str, node_type: str) -> str:
    db = SessionLocal()
    try:
        dify_dataset_id = None
        if node_type == "course":
            c = db.query(Course).filter(Course.id == node_id).first()
            if c:
                dify_dataset_id = c.dify_dataset_id
                db.delete(c)
        elif node_type == "module":
            m = db.query(Module).filter(Module.id == node_id).first()
            if m:
                db.delete(m)
        elif node_type == "node":
            n = db.query(Node).filter(Node.id == node_id).first()
            if n:
                db.delete(n)
        db.commit()
        return dify_dataset_id
    finally:
        db.close()

def get_resources(node_id: str) -> List[dict]:
    db = SessionLocal()
    try:
        # Check if it's a Course (L1)
        course = db.query(Course).filter(Course.id == node_id).first()
        if course:
            resources = db.query(Resource).join(Node).join(Module).filter(Module.course_id == node_id).all()
        else:
            # Check if it's a Module (L2)
            module = db.query(Module).filter(Module.id == node_id).first()
            if module:
                resources = db.query(Resource).join(Node).filter(Node.module_id == node_id).all()
            else:
                # Fallback to Node (L3)
                resources = db.query(Resource).filter(Resource.node_id == node_id).all()
                
        return [
            {
                "id": r.dify_document_id,
                "name": r.name,
                "status": r.status,
                "size": f"{r.size / 1024:.1f} KB" if r.size else "0 KB",
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "date": r.created_at.strftime("%Y-%m-%d") if r.created_at else ""
            }
            for r in resources
        ]
    finally:
        db.close()

def add_resource(node_id: str, resource: dict):
    db = SessionLocal()
    try:
        new_res = Resource(
            node_id=node_id,
            dify_document_id=resource.get("id"),
            name=resource.get("name"),
            status=resource.get("status", "active"),
            size=resource.get("size", 0)
        )
        db.add(new_res)
        db.commit()
    finally:
        db.close()

def delete_resource(node_id: str, document_id: str):
    db = SessionLocal()
    try:
        r = db.query(Resource).filter(Resource.node_id == node_id, Resource.dify_document_id == document_id).first()
        if r:
            db.delete(r)
            db.commit()
    finally:
        db.close()

def complete_processing():
    db = SessionLocal()
    try:
        resources = db.query(Resource).filter(Resource.status.in_(["processing", "active"])).all()
        for r in resources:
            r.status = "completed"
        if resources:
            db.commit()
    finally:
        db.close()

def sync_from_dify(dify_datasets: List[dict]):
    db = SessionLocal()
    try:
        courses = db.query(Course).all()
        existing_dify_map = {c.dify_dataset_id: c for c in courses if c.dify_dataset_id}
        
        for dataset in dify_datasets:
            did = dataset.get("id")
            dname = dataset.get("name", "Untitled Dataset")
            if did:
                if did not in existing_dify_map:
                    new_course = Course(title=dname, dify_dataset_id=did)
                    db.add(new_course)
                # Existing courses can intentionally use a different local title.
        db.commit()
    finally:
        db.close()

def update_tree_node(node_id: str, title: str) -> str:
    db = SessionLocal()
    try:
        dify_dataset_id = None
        
        # Try Course
        c = db.query(Course).filter(Course.id == node_id).first()
        if c:
            c.title = title
            dify_dataset_id = c.dify_dataset_id
        else:
            # Try Module
            m = db.query(Module).filter(Module.id == node_id).first()
            if m:
                m.title = title
            else:
                # Try Node
                n = db.query(Node).filter(Node.id == node_id).first()
                if n:
                    n.title = title
                    
        db.commit()
        return dify_dataset_id
    finally:
        db.close()

import json

def _build_starmap_nodes_for_course(course: Course, stats_map: dict | None = None) -> List[dict]:
    starmap_nodes = []
    stats_map = stats_map or {}
    # Emit Course as a super-hub node
    starmap_nodes.append({
        'id': course.id,
        'title': course.title,
        'subtitle': 'Course',
        'chapter': 'Universe',
        'status': 'mastered',
        'mastery': 100,
        'type': 'course',
        'x': 0,
        'y': 0,
        'deps': []
    })

    for mod in course.modules:
        # Emit Module as a hub node
        starmap_nodes.append({
            'id': mod.id,
            'title': mod.title,
            'subtitle': 'Module',
            'chapter': course.title,
            'status': 'mastered', # Make it visually distinct, e.g., glowing
            'mastery': 100,
            'type': 'module',
            'x': 0,
            'y': 0,
            'deps': [course.id] # Link to Course
        })
        
        # Emit Nodes linked to the Module
        for node in mod.nodes:
            st, m_val = stats_map.get(node.id, ('unlocked', 0))
            starmap_nodes.append({
                'id': node.id,
                'title': node.title,
                'subtitle': 'Node',
                'chapter': mod.title,
                'status': st,
                'mastery': m_val,
                'type': 'node',
                'x': node.x if node.x is not None else 0,
                'y': node.y if node.y is not None else 0,
                'deps': [mod.id] + json.loads(node.deps or '[]')
            })
    return starmap_nodes


def _compute_node_stats(db) -> dict:
    from app.db.models import LearningAnswer
    from collections import defaultdict
    rows = db.query(LearningAnswer).order_by(LearningAnswer.created_at, LearningAnswer.id).all()
    by_node = defaultdict(list)
    for r in rows:
        by_node[r.node_id].append(r)
    stats = {}
    for nid, history in by_node.items():
        recent = history[-5:]
        correct = sum(a.correct for a in recent)
        acc = round(100 * correct / len(recent)) if recent else 0
        if len(recent) >= 3 and correct / len(recent) >= 0.8:
            stats[nid] = ('mastered', acc)
        elif recent and (not recent[-1].correct or correct / len(recent) < 0.6):
            stats[nid] = ('weakness', acc)
        else:
            stats[nid] = ('unlocked', acc)
    return stats


def get_starmap_nodes(course_id: str) -> List[dict]:
    db = SessionLocal()
    try:
        course = db.query(Course).filter(Course.id == course_id).first()
        if not course:
            return []
        stats_map = _compute_node_stats(db)
        return _build_starmap_nodes_for_course(course, stats_map)
    finally:
        db.close()

def get_all_starmap_nodes() -> List[dict]:
    db = SessionLocal()
    try:
        courses = db.query(Course).all()
        stats_map = _compute_node_stats(db)
        all_nodes = []
        for course in courses:
            all_nodes.extend(_build_starmap_nodes_for_course(course, stats_map))
        return all_nodes
    finally:
        db.close()
