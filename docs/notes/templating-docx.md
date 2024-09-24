Templating in docx should be the same as in xlsx.

```
Hello, [:name]
```

Using complex calls and stuff:

```
Names: [join [map [:people] person { [:person name] }] ", "]
```

The difference is that it should have different blocks. Maybe instead of
`[r#repeatRow]` and `[/r#repeatRow]` (`[#repeatRow]` in old syntax), there
should just be `[p#repeatParagraph]`:

```
[p#repeatParagraph 5 line] This is line [:line]
```

## Tables

Tables in docx should be treated the same as they are sheets in xlsx.

But they are a bit complicated, here's a table as described by the spec:

```xml
<w:tbl>
  <w:tblPr>
    <w:tblW w:w="5000" w:type="pct"/>
    <w:tblBorders>
      <w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>
      <w:start w:val="single" w:sz="4" w:space="0" w:color="auto"/>
      <w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>
      <w:end w:val="single" w:sz="4" w:space="0" w:color="auto"/>
    </w:tblBorders>
  </w:tblPr>
  <w:tblGrid>
    <w:gridCol w:w="10296"/>
  </w:tblGrid>
  <w:tr>
    <w:tc>
      <w:tcPr>
        <w:tcW w:w="0" w:type="auto"/>
      </w:tcPr>
      <w:p/>
    </w:tc>
  </w:tr>
</w:tbl>
```

- `w:tblPr` is the whole-table style
- `w:gridCol` represents a whole column
- `w:tr` is a table row, much like how `tr` works in html
- `w:tc` is a cell
- `w:tc > w:tcPr` is the style of that cell
- `w:p` is the paragraph itself, as a regular paragraph it should've
  contained the tag `w:t`

We should only modify the tags `w:tblGrid > w:gridCol` and duplicating `w:tr`
or `w:tc` if needed.

When cloning a column:

- Sum up every `w:tblGrid > w:gridCol` attribute `w:w`
- Add a new `w:gridCol` and properly distribute the `w:w` by:

  ```
  gridColSum = sum(gridCols, g => g['w:w'])
  gridColCount = count(gridCols)
  othersGridColSum = gridColSum - (gridColSum / gridColCount + 1)

  for each gridCols as col:
      ratio = (col['w:w'] / gridColSum) / gridColCount

      col['w:w'] = ratio * othersGridColSum

  addGridCol({ 'w:w': gridColSum / (gridColCount + 1) })
  ```

  This is a bit confusing lmao

## Understanding how tables work

Table in `docx` is a bit different from how sheet works in `xlsx` files. They
not only can have fixed width columns and rows, but also an `autoFit` variant,
which makes this whole templating mess harder.

The official spec type name is `ST_TblLayoutType`. It's used on a child element
of the `w:tblPr` element, named `w:tblLayout`. An example:

```xml
<w:tblPr>
  <w:tblLayout w:type="autoFit"/>
</w:tblPr>
```

`w:type` can either be `autoFit` or `fixed`. Read more on the spec lol.

Here's the copied spec:

> This simple type defines the possible types of layout algorithms which can be
> used to lay out a table within a WordprocessingML document.
>
> These algorithms are defined in the following paragraphs (noting, of course,
> that implementations are free to implement more efficient versions of each).
>
> Fixed Width Table Layout - This method of table layout uses the preferred
> widths on the table items to generate the final sizing of the table, but does
> not change that size regardless of the contents of each table cell, hence the
> table is fixed width.
>
> \[Guidance: Although an application can choose to use a different process,
> this layout could be performed as follows:
>
> 1. The table grid is used to create the set of shared columns in the table
>    and their initial widths as defined in the tblGrid element (§17.4.48).
> 2. The table’s total width is defined based on the tblW property (§17.4.63) –
>    if it is set to auto or nil, then the width is not yet determined and is
>    specified using the row and cell information.
> 3. The first table row is read and the initial number of grid units before
>    the row starts is skipped. The width of the skipped grid columns is set
>    using the wBefore property (§17.4.86).
> 4. The first cell is placed on the grid, and the width of the specified grid
>    column span set by gridSpan (§17.4.17) is set based on the tcW property
>    (§17.4.71).
> 5. Each additional cell is placed on the grid.
> 6. If at any stage, the preferred width requested for the cells exceeds the
>    preferred width of the table, then each grid column is proportionally
>    reduced in size to fit the table width.
> 7. If the grid is exceeded (e.g. tblGrid specifies three grid columns, but
>    the second cell has a gridSpan of three), the grid is dynamically
>    increased with a default width for the new grid column.
> 8. For each subsequent row, cells are placed on the grid, and each grid
>    column is adjusted to be the maximum value of the requested widths (if
>    the widths do not agree) by adding width to the last cell that ends with
>    that grid column. Again, if at any point, the space requested for the
>    cells exceeds the width of the table, then each grid column is
>    proportionally reduced in size to fit the table width. end guidance]
>
> The resulting table shall be displayed regardless of its contents to the size
> requested.
>
> **AutoFit Table Layout** - This method of table layout uses the preferred
> widths on the table items to generate the final sizing of the table, but then
> uses the contents of each cell to determine final column widths. [Guidance:
> This layout can be performed in any manner available to an application, but
> one algorithm as follows can be used:
>
> 1. Perform the steps above to lay out the fixed width version of the table.
> 2. Calculate the minimum content width - the width of the cell's contents
>    including all possible line breaking locations (or the cell's width, if
>    the width of the content is smaller), and the maximum content width -the
>    width of the cell's contents (assuming no line breaking not generated by
>    explicit line breaks).
> 3. The minimum and maximum content width of all cells that span a single grid
>    column is the minimum and maximum content width of that column.
> 4. For cells which span multiple grid columns, enlarge all cells which it
>    spans as needed to meet that cell's minimum width.
> 5. If any cell in a grid column has a preferred width, the first such width
>    overrides the maximum width of the column's contents.
> 6. Place the text in the cells in the table, respecting the minimum content
>    width of each cell's content. If a cell's minimum content width exceeds
>    the cell's current width, preferences are overridden as follows:
> 7. First, override the column widths by making all other grid columns
>    proportionally smaller until each it at its minimum width. This cell can
>    then grow to any width between its own minimum and maximum width.
> 8. Next, override the preferred table width until the table reaches the page
>    width.
> 9. Finally, force a line break in each cell's contents as needed end guidance]
