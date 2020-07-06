# Airtable Blocks Hackathon 2020

Our write up, with screen shots, demo videos, etc: 

https://devpost.com/software/distance-grouping

We decided to submit two related, but distinct blocks to the hackathon:

1. Distance Matrix
2. Distance Grouping

This is reflected in the folder structure of this repository:

```
blocks/distance_matrix/
blocks/distance_grouping/
```

# Install

If you want to fork these blocks or run them in your own Airtable base, you should first be familiar with the blocks development ecosystem. 
This is a good place to start:
https://airtable.com/developers/blocks/guides/getting-started

The basic steps to get this running in your own block are:

1. Download this repo
2. Follow the steps here: https://airtable.com/developers/blocks/guides/run-in-multiple-bases

However, instead of adding a remote, as the above instructions recommend, 
I would go into the repo and modify the remote.json file, changing it to match your new block's id.
That way, you won't have to add the `--remote <name>` option every time you want to run
`block run` or `block release`. 

Note: each of the blocks is its own separate environment, so I'm not sure you should try to share any files between the two.


# Todos

- [ ] Tests
- [ ] Better UI
- [ ] Onboarding
- [ ] Fix combinatoric/scaling issues (partition/grouping/finding best group)
- [ ] Fix matrix chunking logic 
(The current logic requests more data than needed from Google. There seems to be some tradeoff to make between asking for redundant data versus number of requests.)
