# AI-Powered Research Assistant

> Build an AI-powered research assistant inspired by Gemini Notebook that allows users to upload multiple knowledge sources, ask questions grounded in those sources, and receive answers with proper citations.

## Objective

Understand how modern RAG (Retrieval Augmented Generation) systems work by building an end-to-end application that can ingest, index, retrieve, and answer questions from multiple source types.

---

## Requirements

### Notebook / Workspace Management

Your application should support multiple notebooks or workspaces where each notebook can contain multiple knowledge sources.

### Supported Source Types

- PDF
- Plain Text
- Website URL
- YouTube Video
- VTT / Transcript file

### Source Ingestion Pipeline

For each uploaded source:

1. Extract the content
2. Chunk the content
3. Generate embeddings
4. Store embeddings in a vector database
5. Track indexing status
6. Allow the source to be removed or re-indexed

### Source Status Indicators

Your UI should clearly indicate:

- Source is **uploading**
- Source is **indexing**
- Source is **ready for querying**

Each notebook should maintain its own isolated knowledge base.

---

## Querying

Users should be able to ask natural language questions.

Your system should:

1. Retrieve relevant chunks
2. Send retrieved context to the LLM
3. Generate grounded answers
4. Display citations for every answer
5. Allow users to inspect the original source that produced the answer

> The user should never receive an answer without knowing where it came from.

---

## Source Viewer

Selecting a citation should open the original source.

**Examples:**

| Source Type | Behavior                                        |
| ----------- | ----------------------------------------------- |
| PDF         | Opens at the relevant section                   |
| Website     | Opens or previews                               |
| YouTube     | Opens at the referenced timestamp (if possible) |
| Text        | Highlights the relevant section                 |
| Transcript  | Highlights the cited chunk                      |

---

## Bonus Features

- Given a list of YouTube videos/playlists as sources, help the user learn a concept by pin-pointing the concepts with a roadmap personalized based on the sources.
- Create a Podcast out of your sources in which a male/female voice-over comes for your documents that you can listen to.

---

## Submission Instructions

- Public GitHub Repository
- Live Deployment
- README
- Demo Video

---

## Evaluation Parameters

### 1. Notebook Management (10 Marks)

- Multiple notebooks
- Create, rename, and delete notebooks
- Notebook isolation
- Clean UX

### 2. Source Ingestion (20 Marks)

- Supports multiple source types
- Upload flow works correctly
- Indexing pipeline works
- Status indicators are shown
- Source removal works

### 3. RAG Pipeline (20 Marks)

- Chunking strategy
- Embedding generation
- Vector search
- Metadata handling
- Retrieval quality

### 4. AI Responses (15 Marks)

- Responses are grounded
- Streaming responses
- Good prompt construction
- Minimal hallucinations
- Proper formatting

### 5. Citations and Source Attribution (15 Marks)

- Every answer includes citations
- Users can inspect original sources
- Metadata is preserved correctly
- Citation UX is clear

### 6. Architecture and Code Quality (10 Marks)

- Clean folder structure
- Separation of concerns
- Reusable components
- Error handling
- Maintainable code

### 7. UI and User Experience (10 Marks)

- Responsive design
- Loading states
- Empty states
- Smooth interactions
- Clean notebook experience

### 8. README and Documentation (10 Marks)

- Clear setup instructions
- Architecture explanation
- Retrieval flow documented
- Environment variables listed
- Project is easy to run

### 9. Demo Video (10 Marks)

- Features demonstrated clearly
- End-to-end flow shown
- Technical decisions explained
- Video is easy to follow

### 10. Overall Engineering Thoughtfulness (10 Marks)

- Good system design
- Practical implementation choices
- Retrieval quality considered
- Production-oriented thinking
- Clear understanding of modern RAG systems
