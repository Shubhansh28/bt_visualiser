"""
BST Playground — Flask Backend
Runs user Python code with injected BST helper functions.
Returns console output + tree JSON for visualization.
"""

import sys
import io
import json
import threading
import traceback
import collections
from flask import Flask, request, jsonify, render_template, send_from_directory
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# ---------------------------------------------------------------------------
# Helper code injected into every user execution
# ---------------------------------------------------------------------------
HELPER_CODE = r'''
import collections

class TreeNode:
    """Standard LeetCode-style TreeNode."""
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

    def __repr__(self):
        return f"TreeNode({self.val})"


# ── Build helpers ──────────────────────────────────────────────────────────

def build_tree(arr):
    """Build a binary tree from a LeetCode-style list.
    Example: [1, 2, 3, None, None, 4, 5]
    """
    if not arr or arr[0] is None:
        return None
    root = TreeNode(arr[0])
    queue = collections.deque([root])
    i = 1
    while queue and i < len(arr):
        node = queue.popleft()
        if i < len(arr) and arr[i] is not None:
            node.left = TreeNode(arr[i])
            queue.append(node.left)
        i += 1
        if i < len(arr) and arr[i] is not None:
            node.right = TreeNode(arr[i])
            queue.append(node.right)
        i += 1
    return root


def build_tree_dash(arr):
    """Build a binary tree where -1 represents null.
    Example: [1, 2, 3, -1, -1, 4, 5]
    """
    converted = [None if v == -1 else v for v in arr]
    return build_tree(converted)


# ── Serialization helpers ──────────────────────────────────────────────────

def tree_to_list(root):
    """Serialize tree back to LeetCode-style list."""
    if not root:
        return []
    result = []
    queue = collections.deque([root])
    while queue:
        node = queue.popleft()
        if node:
            result.append(node.val)
            queue.append(node.left)
            queue.append(node.right)
        else:
            result.append(None)
    # Trim trailing Nones
    while result and result[-1] is None:
        result.pop()
    return result


def tree_to_json(root):
    """Convert tree to a nested JSON-friendly dict for visualization."""
    if not root:
        return None
    return {
        "val": root.val,
        "left": tree_to_json(root.left),
        "right": tree_to_json(root.right),
    }


# ── Traversal helpers ─────────────────────────────────────────────────────

def inorder(root):
    """Return in-order traversal as a list."""
    if not root:
        return []
    return inorder(root.left) + [root.val] + inorder(root.right)


def preorder(root):
    """Return pre-order traversal as a list."""
    if not root:
        return []
    return [root.val] + preorder(root.left) + preorder(root.right)


def postorder(root):
    """Return post-order traversal as a list."""
    if not root:
        return []
    return postorder(root.left) + postorder(root.right) + [root.val]


def level_order(root):
    """Return level-order traversal as a list of lists."""
    if not root:
        return []
    result, queue = [], collections.deque([root])
    while queue:
        level = []
        for _ in range(len(queue)):
            node = queue.popleft()
            level.append(node.val)
            if node.left:
                queue.append(node.left)
            if node.right:
                queue.append(node.right)
        result.append(level)
    return result


# ── Pretty print ──────────────────────────────────────────────────────────

def print_tree(root, prefix="", is_left=True):
    """Pretty-print the binary tree structure to stdout."""
    if root is None:
        return
    if root.right:
        print_tree(root.right, prefix + ("│   " if is_left else "    "), False)
    connector = "└── " if is_left else "┌── "
    print(prefix + connector + str(root.val))
    if root.left:
        print_tree(root.left, prefix + ("    " if is_left else "│   "), True)
'''


# ---------------------------------------------------------------------------
# Thread-based code execution with timeout
# ---------------------------------------------------------------------------

def _exec_code_in_thread(full_code, result_dict):
    """Run exec() inside a thread so we can enforce a timeout via join()."""
    captured = io.StringIO()
    old_stdout = sys.stdout
    sys.stdout = captured
    namespace = {}
    error_msg = None

    try:
        exec(full_code, namespace)
    except Exception as e:
        error_msg = f"{type(e).__name__}: {e}"
    finally:
        sys.stdout = old_stdout

    result_dict["output"] = captured.getvalue()
    result_dict["namespace"] = namespace
    result_dict["error"] = error_msg


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return send_from_directory(".", "index.html")


@app.route("/run", methods=["POST"])
def run_code():
    data = request.get_json()
    user_code = data.get("code", "")
    tree_input = data.get("tree_input", "").strip()
    input_format = data.get("input_format", "leetcode")  # "leetcode" or "dash"

    # Build the setup code that creates 'root' from user input
    setup_code = ""
    if tree_input:
        # Parse the input string into a Python list
        try:
            # Normalise: allow "null", "None", "N" as None
            sanitised = tree_input.strip()
            if sanitised.startswith("["):
                sanitised = sanitised[1:]
            if sanitised.endswith("]"):
                sanitised = sanitised[:-1]
            elements = []
            for tok in sanitised.split(","):
                tok = tok.strip()
                if tok.lower() in ("null", "none", "n", ""):
                    elements.append(None)
                elif tok == "-1" and input_format == "dash":
                    elements.append(None)
                else:
                    try:
                        elements.append(int(tok))
                    except ValueError:
                        try:
                            elements.append(float(tok))
                        except ValueError:
                            elements.append(tok)
            list_repr = repr(elements)
        except Exception as e:
            return jsonify({"output": "", "tree_json": None, "error": f"Invalid tree input: {e}"})

        setup_code = f"\n__input_arr = {list_repr}\nroot = build_tree(__input_arr)\n"
    else:
        setup_code = "\nroot = None\n"

    # Compose full code: helpers → tree setup → user code
    full_code = HELPER_CODE + setup_code + "\n" + user_code

    # Run in a thread with 5-second timeout
    result_dict = {}
    thread = threading.Thread(target=_exec_code_in_thread, args=(full_code, result_dict))
    thread.daemon = True
    thread.start()
    thread.join(timeout=5)

    if thread.is_alive():
        return jsonify({
            "output": "",
            "tree_json": None,
            "error": "⏱ Code execution timed out (5 second limit). Check for infinite loops.",
        })

    output = result_dict.get("output", "")
    error_msg = result_dict.get("error")
    namespace = result_dict.get("namespace", {})
    tree_json = None

    # Extract the final tree
    if "root" in namespace and namespace["root"] is not None:
        try:
            tree_to_json_fn = namespace.get("tree_to_json")
            if tree_to_json_fn:
                tree_json = tree_to_json_fn(namespace["root"])
        except Exception:
            pass

    return jsonify({
        "output": output,
        "tree_json": tree_json,
        "error": error_msg,
    })


@app.route("/simulate", methods=["POST"])
def simulate_code():
    """Trace user code execution and return step-by-step simulation data."""
    data = request.get_json()
    user_code = data.get("code", "")
    tree_input = data.get("tree_input", "").strip()
    input_format = data.get("input_format", "leetcode")

    # Build setup code (same logic as /run)
    setup_code = ""
    if tree_input:
        try:
            sanitised = tree_input.strip()
            if sanitised.startswith("["):
                sanitised = sanitised[1:]
            if sanitised.endswith("]"):
                sanitised = sanitised[:-1]
            elements = []
            for tok in sanitised.split(","):
                tok = tok.strip()
                if tok.lower() in ("null", "none", "n", ""):
                    elements.append(None)
                elif tok == "-1" and input_format == "dash":
                    elements.append(None)
                else:
                    try:
                        elements.append(int(tok))
                    except ValueError:
                        try:
                            elements.append(float(tok))
                        except ValueError:
                            elements.append(tok)
            list_repr = repr(elements)
        except Exception as e:
            return jsonify({"steps": [], "tree_json": None, "error": f"Invalid tree input: {e}"})

        setup_code = f"\n__input_arr = {list_repr}\nroot = build_tree(__input_arr)\n"
    else:
        setup_code = "\nroot = None\n"

    full_code = HELPER_CODE + setup_code + "\n" + user_code

    # Count lines before user code to compute user-relative line numbers
    pre_lines = len((HELPER_CODE + setup_code + "\n").splitlines())

    steps = []
    max_steps = 2000  # Safety limit
    error_msg = None

    def trace_fn(frame, event, arg):
        nonlocal error_msg
        if len(steps) >= max_steps:
            return None

        lineno = frame.f_lineno
        user_line = lineno - pre_lines  # 1-based relative to user code

        # Only trace lines within user code range
        if user_line < 1:
            return trace_fn

        # Try to extract current node value from local variables
        node_val = None
        try:
            local_vars = frame.f_locals
            for var_name in ("root", "node", "self", "curr", "current", "p", "n"):
                obj = local_vars.get(var_name)
                if obj is not None and hasattr(obj, "val"):
                    node_val = obj.val
                    break
            # Also check any var that looks like a TreeNode
            if node_val is None:
                for var_name in list(local_vars.keys())[:10]:  # limit search
                    obj = local_vars.get(var_name)
                    if obj is not None and hasattr(obj, "val") and hasattr(obj, "left") and hasattr(obj, "right"):
                        node_val = obj.val
                        break
        except Exception:
            pass

        # Calculate recursion depth (with safety limit)
        depth = 0
        try:
            f = frame.f_back
            func_name = frame.f_code.co_name
            max_walk = 50  # Don't walk more than 50 frames
            walked = 0
            while f and walked < max_walk:
                if f.f_code.co_name == func_name and f.f_lineno > pre_lines:
                    depth += 1
                f = f.f_back
                walked += 1
        except Exception:
            pass

        step = {
            "line": user_line,
            "event": event,
            "node_val": node_val,
            "depth": depth,
            "func": frame.f_code.co_name if frame else "",
        }

        if event == "exception":
            try:
                exc_type, exc_value, _ = arg
                step["error"] = f"{exc_type.__name__}: {exc_value}"
                error_msg = step["error"]
            except Exception:
                step["error"] = "Unknown exception"
                error_msg = step["error"]

        if event == "return":
            ret = arg
            if ret is not None:
                try:
                    step["return_val"] = repr(ret)[:100]
                except Exception:
                    pass

        steps.append(step)
        return trace_fn

    # Execute with tracing
    namespace = {}
    captured = io.StringIO()
    old_stdout = sys.stdout

    def run_traced():
        nonlocal error_msg
        # Set a safe recursion limit so RecursionError is caught
        # before it can blow up the entire process
        original_limit = sys.getrecursionlimit()
        sys.setrecursionlimit(200)
        sys.stdout = captured
        sys.settrace(trace_fn)
        try:
            exec(full_code, namespace)
        except RecursionError as e:
            error_msg = f"RecursionError: {e}"
            steps.append({
                "line": -1,
                "event": "error",
                "node_val": None,
                "depth": 0,
                "func": "",
                "error": error_msg,
            })
        except Exception as e:
            error_msg = f"{type(e).__name__}: {e}"
            steps.append({
                "line": -1,
                "event": "error",
                "node_val": None,
                "depth": 0,
                "func": "",
                "error": error_msg,
            })
        finally:
            sys.settrace(None)
            sys.stdout = old_stdout
            sys.setrecursionlimit(original_limit)

    thread = threading.Thread(target=run_traced)
    thread.daemon = True
    thread.start()
    thread.join(timeout=5)

    if thread.is_alive():
        return jsonify({
            "steps": steps,
            "tree_json": None,
            "error": "⏱ Code execution timed out (5 second limit).",
        })

    # Extract tree JSON
    tree_json = None
    if "root" in namespace and namespace["root"] is not None:
        try:
            tree_to_json_fn = namespace.get("tree_to_json")
            if tree_to_json_fn:
                tree_json = tree_to_json_fn(namespace["root"])
        except Exception:
            pass

    # Also get the input tree (before user code ran) for visualization
    input_tree_json = None
    if tree_input:
        try:
            # Re-build the input tree for reference
            temp_ns = {}
            exec(HELPER_CODE + setup_code + "\n__input_tree_json = tree_to_json(root)", temp_ns)
            input_tree_json = temp_ns.get("__input_tree_json")
        except Exception:
            pass

    return jsonify({
        "steps": steps,
        "tree_json": tree_json,
        "input_tree_json": input_tree_json,
        "output": captured.getvalue(),
        "error": error_msg,
        "user_code_lines": user_code.splitlines(),
    })


if __name__ == "__main__":
    app.run(debug=True, port=5000)
