## IDEATING AN API FOR EXTRACTOR

API must be able to handle these two cases:

- 2D Sheet, different advancement pattern (left-down), and possibility
  of implementing of a custom advancement pattern like repeatCol, or maybe
  perhaps repeatBlock in the future.

- Linear 1D Document, with the ability to parse a table inside the 1D
  document (prob through recursion).

### High-level view of the API

- Item - A "thing" that stores information about expression and other things

  - retrieve the expression stored within this "thing"

- Source - The source of Items.

  - internal system should be able to retrieve an Item from this.
    since we can get the expression of an item, we can iterate through it,
    and call Extractor each time an "interesting" something happened.

- Visitor - Reacts to when encountering an interesting block.

  - can receive different events when internal system encountered something of
    interest. after that, it must be able to have access to the Item in
    question, with the ability of modifying or replacing that Item.

    It must also possess the ability to advance differently.

Internal system must have a method of advancement, with the ability to change
it when needed (e.g. encountering a repeatCol, the advancement pattern must go
vertically rather than horizontally until it found a closing repeatCol).

Or perhaps being recursive would make it more extensible and easier?

Everytime an extractor wants to change its advancement pattern, it will make
another extractor with the same `Source` but a different advancement pattern.
