# LangGraph in Simple Terms

LangGraph is a library built on top of LangChain that lets you build AI applications as **graphs** — where each step in your logic is a node, and the connections between them are edges. Think of it like a flowchart that your code actually follows.

---

## Creating a Structure (The Graph)

A LangGraph app is built by defining a **graph**. You create it step by step:

1. **Define your nodes** — each node is a function that does one thing (call an LLM, check a condition, fetch data, etc.).
2. **Define your edges** — these connect nodes together and control the flow. Edges can be simple (always go from A to B) or conditional (go to B if X, go to C if Y).
3. **Compile the graph** — once your nodes and edges are set, you compile the graph into a runnable app.

```python
from langgraph.graph import StateGraph

graph = StateGraph(MyState)

graph.add_node("ask_model", call_model)
graph.add_node("use_tool", run_tool)

graph.add_edge("ask_model", "use_tool")
graph.set_entry_point("ask_model")
graph.set_finish_point("use_tool")

app = graph.compile()
```

This is the skeleton. You are basically telling the program: "Start here, go there, and stop when you reach the end."

---

## State

State is the **shared data** that gets passed from node to node. Every node can read from it and write to it. It is how your nodes communicate with each other.

You define state as a simple class (usually a `TypedDict` or a Pydantic model):

```python
from typing import TypedDict, Annotated
from langgraph.graph.message import add_messages

class MyState(TypedDict):
    messages: Annotated[list, add_messages]
    user_name: str
```

- `messages` holds the conversation history. The `add_messages` annotation tells LangGraph to **append** new messages instead of replacing the list.
- `user_name` is just a regular field — each node can read or update it.

When a node returns `{"user_name": "Steve"}`, that value gets written into the state, and the next node can access it.

State is the backbone of LangGraph. Without it, nodes would have no way to share information.

---

## Models (The LLM)

The "model" is the large language model (like ChatGPT or Claude) that does the actual thinking. In LangGraph, you create a model using LangChain's chat model classes:

```python
from langchain_openai import ChatOpenAI

model = ChatOpenAI(model="gpt-4o", temperature=0)
```

Or for Anthropic:

```python
from langchain_anthropic import ChatAnthropic

model = ChatAnthropic(model="claude-sonnet-4-20250514")
```

You then call this model inside a node function:

```python
def call_model(state: MyState):
    response = model.invoke(state["messages"])
    return {"messages": [response]}
```

The model takes in the messages from state, generates a response, and the node puts that response back into state. That is all a model node does.

---

## Prompt Templates

A prompt template is a **reusable text blueprint** with placeholders that get filled in at runtime. Instead of hardcoding your prompts, you write them once with variables:

```python
from langchain_core.prompts import ChatPromptTemplate

prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a helpful assistant. The user's name is {user_name}."),
    ("placeholder", "{messages}")
])
```

Then in your node, you fill in the blanks using state:

```python
def call_model(state: MyState):
    chain = prompt | model
    response = chain.invoke({
        "user_name": state["user_name"],
        "messages": state["messages"]
    })
    return {"messages": [response]}
```

The `|` (pipe) operator chains the prompt and model together — the prompt formats the text, then passes it straight to the model.

Prompt templates keep your prompts clean, reusable, and separate from your logic.

---

## How It All Fits Together

```
State (shared data)
  |
  v
[Node 1: Format prompt template + call model] --> updates state
  |
  v
[Node 2: Check if tool is needed] --> conditional edge
  |         \
  v          v
[Node 3]   [Node 4]
  |
  v
 END
```

1. **State** carries the data.
2. **Prompt templates** shape what the model sees.
3. **Models** generate responses.
4. **The graph structure** (nodes + edges) controls the flow.

That is LangGraph: a way to wire up LLM calls into a controlled, step-by-step workflow where state flows through a graph you design.
